import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PosWorkspaceActivationService } from '../branch-staff/pos-workspace-activation.service';
import { SupplierActivationService } from '../suppliers/supplier-activation.service';
import { EquityPartnerBnplService } from '../retail/equity-partner-bnpl.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { SubscriptionPaymentClaimsService } from '../subscription-payments/subscription-payment-claims.service';
import { SubscriptionPaymentMailerService } from '../subscription-payments/subscription-payment-mailer.service';
import { SubscriptionPaymentClaim } from '../subscription-payments/entities/subscription-payment-claim.entity';
import { findSubscriptionPaymentDestination } from '../subscription-payments/payment-destinations';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import { Branch } from '../branches/entities/branch.entity';
import { User } from '../users/entities/user.entity';
import { getPosPaidGraceDays } from '../branch-staff/pos-branch-renewal.policy';
import { POS_SELF_SERVE_TRIAL_PLAN_CODES } from '../retail/pos-self-serve-trial.policy';

const DAY_MS = 86_400_000;
const REPORT_MONTHS = 12;

/** `2026-11` for an instant, on the Addis Ababa calendar the business runs on. */
function monthKey(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Admin review of subscription payments made by transfer, and the money report
 * built from them.
 *
 * Approval is the ONLY thing that turns a customer's claim into a term, a new
 * branch, an active supplier or a settled BNPL activation — and it does so by
 * calling the same completion code that has always run for a confirmed payment,
 * keyed on the claim's reference, so approving twice grants once.
 */
@Injectable()
export class SubscriptionPaymentReviewService {
  private readonly logger = new Logger(SubscriptionPaymentReviewService.name);
  private readonly reviewsInFlight = new Map<
    number,
    Promise<SubscriptionPaymentClaim>
  >();

  constructor(
    private readonly claims: SubscriptionPaymentClaimsService,
    private readonly posActivation: PosWorkspaceActivationService,
    private readonly supplierActivation: SupplierActivationService,
    private readonly bnpl: EquityPartnerBnplService,
    private readonly notifications: NotificationsService,
    @InjectRepository(EbirrTransaction)
    private readonly ebirrRepo: Repository<EbirrTransaction>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionsRepo: Repository<TenantSubscription>,
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @Optional()
    private readonly mailer?: SubscriptionPaymentMailerService,
  ) {}

  async list(filter: { status?: string; limit?: number }) {
    const status = String(filter.status || 'SUBMITTED').toUpperCase();
    const rows = await this.claims.listForAdmin({
      status: ['SUBMITTED', 'APPROVED', 'REJECTED', 'ALL'].includes(status)
        ? (status as 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ALL')
        : 'SUBMITTED',
      limit: filter.limit,
    });
    return this.describeMany(rows);
  }

  async approve(
    id: number,
    reviewer: { id: number },
    note?: string | null,
  ): Promise<SubscriptionPaymentClaim> {
    const running = this.reviewsInFlight.get(id);
    if (running !== undefined) return running;
    const run = this.applyApproval(id, reviewer, note).finally(() =>
      this.reviewsInFlight.delete(id),
    );
    this.reviewsInFlight.set(id, run);
    return run;
  }

  private async applyApproval(
    id: number,
    reviewer: { id: number },
    note?: string | null,
  ): Promise<SubscriptionPaymentClaim> {
    const claim = await this.claims.findByIdOrFail(id);
    if (claim.status === 'APPROVED') return claim;
    if (claim.status === 'REJECTED') {
      throw new ConflictException(
        'This payment was rejected. Ask the customer to submit it again.',
      );
    }

    // Grant first, mark second: if granting fails the claim stays in the queue
    // with the error shown, instead of reading "approved" with nothing given.
    switch (claim.kind) {
      case 'POS_BRANCH': {
        const granted = await this.posActivation.completeActivationPayment(
          claim.referenceId,
          (claim.period as 'MONTHLY' | 'ONE_YEAR' | 'STARTER') || undefined,
        );
        if (!granted) {
          throw new BadRequestException(
            'This payment reference cannot be matched to a branch.',
          );
        }
        break;
      }
      case 'POS_BRANCH_CREATE': {
        const created = await this.posActivation.completeBranchCreationPayment(
          claim.referenceId,
        );
        if (!created.branchId) {
          throw new ConflictException(
            'The branch details for this payment are no longer on file. Record the term by hand from Branches, or reject and ask the customer to resubmit.',
          );
        }
        claim.branchId = created.branchId;
        break;
      }
      case 'SUPPLIER': {
        const granted = await this.supplierActivation.completeActivationPayment(
          claim.referenceId,
          (claim.period as 'MONTHLY' | 'ONE_YEAR') || undefined,
        );
        if (!granted) {
          throw new BadRequestException(
            'This payment reference cannot be matched to a supplier account.',
          );
        }
        break;
      }
      case 'BNPL': {
        const settled = await this.bnpl.completeSettlement(claim.referenceId);
        if (!settled) {
          throw new BadRequestException(
            'This payment reference cannot be matched to a BNPL activation.',
          );
        }
        break;
      }
      default:
        throw new BadRequestException(
          `Unknown payment kind: ${String(claim.kind)}`,
        );
    }

    const saved = await this.claims.markReviewed(
      claim,
      'APPROVED',
      reviewer,
      note,
    );
    await this.notifyCustomer(saved, {
      title: 'Payment verified',
      body: `Your payment of ${saved.currency} ${Number(saved.amount).toLocaleString('en-US')} for ${saved.subjectName || 'your subscription'} has been verified. Thank you.`,
      kind: 'SUBSCRIPTION_PAYMENT_APPROVED',
    });
    // A branch term already emails its receipt on completion; the other kinds
    // get the "verified" email here.
    void this.mailer?.paymentApproved(saved, {
      receiptAlreadySent: saved.kind === 'POS_BRANCH',
    });
    return saved;
  }

  async reject(
    id: number,
    reviewer: { id: number },
    reason: string,
  ): Promise<SubscriptionPaymentClaim> {
    const trimmed = String(reason || '').trim();
    if (trimmed.length < 3) {
      throw new BadRequestException(
        'Say why the payment is rejected — the customer is shown the reason.',
      );
    }
    const claim = await this.claims.findByIdOrFail(id);
    if (claim.status === 'APPROVED') {
      throw new ConflictException(
        'This payment has already been approved and the term granted.',
      );
    }
    if (claim.status === 'REJECTED') return claim;
    const saved = await this.claims.markReviewed(
      claim,
      'REJECTED',
      reviewer,
      trimmed,
    );
    await this.notifyCustomer(saved, {
      title: 'Payment could not be verified',
      body: `We could not verify your payment for ${saved.subjectName || 'your subscription'}: ${trimmed} Please check the details and submit it again.`,
      kind: 'SUBSCRIPTION_PAYMENT_REJECTED',
    });
    void this.mailer?.paymentRejected(saved);
    return saved;
  }

  private async notifyCustomer(
    claim: SubscriptionPaymentClaim,
    message: { title: string; body: string; kind: string },
  ): Promise<void> {
    try {
      await this.notifications.createAndDispatch({
        userId: claim.userId,
        title: message.title,
        body: message.body,
        type: NotificationType.ACCOUNT,
        data: {
          kind: message.kind,
          claimId: claim.id,
          referenceId: claim.referenceId,
          branchId: claim.branchId ?? null,
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Could not notify user ${claim.userId} about payment #${claim.id}: ${err?.message}`,
      );
    }
  }

  private async describeMany(rows: SubscriptionPaymentClaim[]) {
    const userIds = Array.from(
      new Set(
        rows
          .flatMap((row) => [row.userId, row.reviewedByUserId])
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    const users = userIds.length
      ? await this.usersRepo.find({
          where: { id: In(userIds) },
          select: ['id', 'email', 'displayName'] as any,
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    return rows.map((row) => {
      const destination = findSubscriptionPaymentDestination(row.channel);
      const submitter = userById.get(row.userId);
      const reviewer = row.reviewedByUserId
        ? userById.get(row.reviewedByUserId)
        : null;
      return {
        id: row.id,
        referenceId: row.referenceId,
        kind: row.kind,
        status: row.status,
        subjectName: row.subjectName,
        branchId: row.branchId ?? null,
        supplierProfileId: row.supplierProfileId ?? null,
        bnplActivationId: row.bnplActivationId ?? null,
        period: row.period,
        periodMonths: row.periodMonths,
        amount: Number(row.amount),
        currency: row.currency,
        channel: row.channel,
        paidTo: destination
          ? `${destination.label} ${destination.account} (${destination.accountName})`
          : row.channel,
        payerReference: row.payerReference,
        payerName: row.payerName,
        receiptUrl: row.receiptUrl,
        submittedBy: submitter
          ? {
              id: submitter.id,
              email: submitter.email,
              name: (submitter as any).displayName ?? null,
            }
          : { id: row.userId, email: null, name: null },
        createdAt: row.createdAt,
        waitingHours:
          row.status === 'SUBMITTED'
            ? Math.max(
                0,
                Math.round((Date.now() - row.createdAt.getTime()) / 3_600_000),
              )
            : null,
        reviewedAt: row.reviewedAt ?? null,
        reviewedBy: reviewer ? reviewer.email : null,
        reviewNote: row.reviewNote ?? null,
      };
    });
  }

  /**
   * The money report: what was actually collected (not a run-rate estimate),
   * by month and by where it landed; what is waiting to be verified; and which
   * paid branches are in their grace days or have just lapsed.
   */
  async report(now: Date = new Date()) {
    const [claims, legacyEbirr, subscriptionRows] = await Promise.all([
      this.claims.listAll(),
      this.ebirrRepo
        .createQueryBuilder('e')
        .where('e.merch_order_id ~ :pattern', {
          pattern: '^(POSACT|POSBRANCH|SUPACT|BNPLACT)-',
        })
        .andWhere('e.status IN (:...statuses)', {
          statuses: ['COMPLETED', 'SUCCESS', 'APPROVED', 'PAID'],
        })
        .getMany(),
      this.subscriptionsRepo.find({ order: { createdAt: 'DESC' } }),
    ]);

    // --- Collected, by month and channel -----------------------------------
    const months: string[] = [];
    const cursor = new Date(now);
    for (let i = 0; i < REPORT_MONTHS; i += 1) {
      months.unshift(monthKey(cursor));
      cursor.setUTCDate(1);
      cursor.setUTCMonth(cursor.getUTCMonth() - 1);
    }
    const emptyMonth = () => ({
      EBIRR: 0,
      CBE: 0,
      EBIRR_API_LEGACY: 0,
      RECORDED_BY_ADMIN: 0,
      total: 0,
      payments: 0,
    });
    const byMonth = new Map(months.map((key) => [key, emptyMonth()]));
    const add = (
      at: Date | string,
      channel: 'EBIRR' | 'CBE' | 'EBIRR_API_LEGACY' | 'RECORDED_BY_ADMIN',
      amount: number,
    ) => {
      const bucket = byMonth.get(monthKey(at));
      if (!bucket || !(amount > 0)) return;
      bucket[channel] = round2(bucket[channel] + amount);
      bucket.total = round2(bucket.total + amount);
      bucket.payments += 1;
    };
    for (const claim of claims) {
      if (claim.status !== 'APPROVED') continue;
      add(
        claim.reviewedAt ?? claim.createdAt,
        claim.channel === 'CBE' ? 'CBE' : 'EBIRR',
        Number(claim.amount),
      );
    }
    for (const tx of legacyEbirr) {
      add(
        tx.updated_at ?? tx.created_at,
        'EBIRR_API_LEGACY',
        Number(tx.amount),
      );
    }
    for (const sub of subscriptionRows) {
      if (!sub.metadata?.manualExtension) continue;
      add(sub.createdAt, 'RECORDED_BY_ADMIN', Number(sub.amountTotal ?? 0));
    }
    const collectedByMonth = months.map((month) => ({
      month,
      ...byMonth.get(month),
    }));
    const thisMonth = collectedByMonth[collectedByMonth.length - 1];
    const lastMonth = collectedByMonth[collectedByMonth.length - 2] ?? null;

    // --- Waiting to be verified ---------------------------------------------
    const waiting = claims.filter((claim) => claim.status === 'SUBMITTED');
    const oldestWaiting = waiting.reduce<Date | null>(
      (oldest, claim) =>
        !oldest || claim.createdAt < oldest ? claim.createdAt : oldest,
      null,
    );
    const rejectedLast30 = claims.filter(
      (claim) =>
        claim.status === 'REJECTED' &&
        claim.reviewedAt &&
        now.getTime() - claim.reviewedAt.getTime() <= 30 * DAY_MS,
    ).length;

    // --- Paid branches in grace / just lapsed --------------------------------
    const graceDays = getPosPaidGraceDays();
    const trialCodes: readonly string[] = POS_SELF_SERVE_TRIAL_PLAN_CODES;
    const latestByBranch = new Map<number, TenantSubscription>();
    for (const sub of subscriptionRows) {
      if (sub.branchId == null || latestByBranch.has(sub.branchId)) continue;
      latestByBranch.set(sub.branchId, sub);
    }
    const attention: Array<{
      branchId: number;
      state: 'IN_GRACE' | 'LAPSED';
      endsAt: Date;
      graceEndsAt: Date;
      monthlyAmount: number;
      hasPaymentWaiting: boolean;
    }> = [];
    const waitingBranchIds = new Set(
      waiting.map((claim) => claim.branchId).filter(Boolean),
    );
    for (const [branchId, sub] of latestByBranch) {
      if (!sub.endsAt || trialCodes.includes(sub.planCode)) continue;
      const endedMs = now.getTime() - sub.endsAt.getTime();
      if (endedMs <= 0 || endedMs > 30 * DAY_MS) continue;
      const stillServing =
        sub.status === TenantSubscriptionStatus.ACTIVE &&
        endedMs < graceDays * DAY_MS;
      if (
        !stillServing &&
        sub.status !== TenantSubscriptionStatus.ACTIVE &&
        sub.status !== TenantSubscriptionStatus.EXPIRED
      ) {
        continue;
      }
      attention.push({
        branchId,
        state: stillServing ? 'IN_GRACE' : 'LAPSED',
        endsAt: sub.endsAt,
        graceEndsAt: new Date(sub.endsAt.getTime() + graceDays * DAY_MS),
        monthlyAmount:
          sub.amountTotal != null && sub.periodMonths
            ? round2(Number(sub.amountTotal) / sub.periodMonths)
            : Number(sub.amount ?? 0),
        hasPaymentWaiting: waitingBranchIds.has(branchId),
      });
    }
    const branches = attention.length
      ? await this.branchesRepo.find({
          where: { id: In(attention.map((row) => row.branchId)) },
          relations: { owner: true },
        })
      : [];
    const branchById = new Map(branches.map((branch) => [branch.id, branch]));
    const attentionRows = attention
      .filter((row) => branchById.get(row.branchId)?.isActive !== false)
      .map((row) => {
        const branch = branchById.get(row.branchId);
        return {
          ...row,
          branchName: branch?.name ?? `Branch #${row.branchId}`,
          ownerEmail: (branch as any)?.owner?.email ?? null,
          phone: branch?.phone ?? null,
        };
      })
      .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());

    return {
      generatedAt: now.toISOString(),
      currency: 'ETB',
      graceDays,
      collected: {
        thisMonth: thisMonth?.total ?? 0,
        thisMonthPayments: thisMonth?.payments ?? 0,
        lastMonth: lastMonth?.total ?? 0,
        last12Months: round2(
          collectedByMonth.reduce((sum, row) => sum + (row.total ?? 0), 0),
        ),
        byMonth: collectedByMonth,
      },
      waiting: {
        count: waiting.length,
        amount: round2(
          waiting.reduce((sum, claim) => sum + Number(claim.amount), 0),
        ),
        oldestSubmittedAt: oldestWaiting,
        oldestWaitingHours: oldestWaiting
          ? Math.round((now.getTime() - oldestWaiting.getTime()) / 3_600_000)
          : null,
      },
      rejectedLast30Days: rejectedLast30,
      branchesInGrace: attentionRows.filter((row) => row.state === 'IN_GRACE'),
      branchesLapsedLast30Days: attentionRows.filter(
        (row) => row.state === 'LAPSED',
      ),
    };
  }
}
