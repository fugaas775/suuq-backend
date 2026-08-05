import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { isLivePosSelfServeTrial } from '../retail/pos-self-serve-trial.policy';
import {
  BranchStaffService,
  PosBranchSummary,
  PosWorkspaceActivationCandidate,
} from './branch-staff.service';

import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { EbirrService } from '../ebirr/ebirr.service';
import { EmailService } from '../email/email.service';
import { EquityPartnerService } from '../retail/equity-partner.service';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from './entities/branch-staff-assignment.entity';
import { Branch } from '../branches/entities/branch.entity';
import { User } from '../users/entities/user.entity';
import {
  TenantBillingInterval,
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import {
  RetailModule,
  TenantModuleEntitlement,
} from '../retail/entities/tenant-module-entitlement.entity';
import {
  POS_BRANCH_SUBSCRIPTION_CURRENCY,
  POS_BRANCH_SUBSCRIPTION_MONTHLY_EQUIVALENT,
  POS_BRANCH_SUBSCRIPTION_OPTIONS,
  PosBranchSubscriptionOption,
  PosBranchSubscriptionPeriod,
  findPosBranchSubscriptionOption,
  requirePosBranchSubscriptionOption,
} from './pos-workspace-pricing';

/**
 * What `getPayableActivationCandidate` needs from either source: a closed
 * workspace awaiting activation, or an open branch on a convertible free trial.
 */
type PayableActivationTarget = Pick<
  PosWorkspaceActivationCandidate | PosBranchSummary,
  | 'branchId'
  | 'branchName'
  | 'serviceFormat'
  | 'retailTenantId'
  | 'isOwner'
  | 'role'
  | 'canPayNow'
> & { workspaceStatus: string };

const POS_WORKSPACE_REFERENCE_PREFIX = 'POSACT';
export { POS_WORKSPACE_REFERENCE_PREFIX };
const BRANCH_CREATE_REFERENCE_PREFIX = 'POSBRANCH';
const POS_WORKSPACE_CURRENCY = POS_BRANCH_SUBSCRIPTION_CURRENCY;
/**
 * Default subscription period when callers do not specify one. Defaults to the
 * monthly plan — the lowest-barrier entry option.
 */
const DEFAULT_POS_BRANCH_PERIOD: PosBranchSubscriptionPeriod = 'MONTHLY';
export const PRIMARY_RETAIL_CATEGORY_BLOCKER =
  'Choose a primary retail category.';
export const POS_FIT_CATEGORY_BLOCKER = 'Choose a POS fit category.';

@Injectable()
export class PosWorkspaceActivationService {
  private readonly logger = new Logger(PosWorkspaceActivationService.name);

  constructor(
    private readonly branchStaffService: BranchStaffService,
    private readonly retailEntitlementsService: RetailEntitlementsService,
    private readonly ebirrService: EbirrService,
    @InjectRepository(TenantSubscription)
    private readonly tenantSubscriptionsRepository: Repository<TenantSubscription>,
    @InjectRepository(TenantModuleEntitlement)
    private readonly tenantModuleEntitlementsRepository: Repository<TenantModuleEntitlement>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly branchStaffAssignmentsRepository: Repository<BranchStaffAssignment>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly emailService: EmailService,
    private readonly equityPartnerService: EquityPartnerService,
  ) {}

  /**
   * Static catalog of branch subscription periods exposed to the gate /
   * billing UI so the frontend does not need to hardcode prices.
   */
  listSubscriptionOptions(): readonly PosBranchSubscriptionOption[] {
    return POS_BRANCH_SUBSCRIPTION_OPTIONS;
  }

  async startEbirrActivationPayment(
    user: { id: number; roles?: string[] },
    params: {
      branchId: number;
      phoneNumber: string;
      subscriptionPeriod?: string | null;
      referralCode?: string | null;
    },
  ) {
    const candidate = await this.getPayableActivationCandidate(
      user,
      params.branchId,
    );
    const option =
      findPosBranchSubscriptionOption(params.subscriptionPeriod) ??
      requirePosBranchSubscriptionOption(DEFAULT_POS_BRANCH_PERIOD);
    // The period rides on the reference so completion can recover it even when
    // the branch has no subscription row to stash `pendingActivation` on.
    // parseBranchIdFromReference is anchored (/^POSACT-(\d+)-/), so appending a
    // suffix stays compatible with every reference already in the Ebirr ledger.
    const referenceId = `${POS_WORKSPACE_REFERENCE_PREFIX}-${candidate.branchId}-${Date.now()}-${option.period}`;
    const invoiceId = `${POS_WORKSPACE_REFERENCE_PREFIX}INV-${candidate.branchId}`;
    const paymentResponse = await this.ebirrService.initiatePayment({
      phoneNumber: params.phoneNumber,
      amount: option.amount.toFixed(2),
      referenceId,
      invoiceId,
      description: `POS workspace activation (${option.label}) for ${candidate.branchName}`,
    });

    const rawCheckoutUrl =
      paymentResponse?.toPayUrl && typeof paymentResponse.toPayUrl === 'string'
        ? paymentResponse.toPayUrl.trim()
        : null;
    const checkoutUrl =
      rawCheckoutUrl && /^https?:\/\//i.test(rawCheckoutUrl)
        ? rawCheckoutUrl
        : null;
    const receiveCode =
      typeof paymentResponse?.receiverCode === 'string' &&
      paymentResponse.receiverCode.trim()
        ? paymentResponse.receiverCode.trim()
        : typeof paymentResponse?.ussd === 'string' &&
            paymentResponse.ussd.trim()
          ? paymentResponse.ussd.trim()
          : null;
    const providerMessage =
      typeof paymentResponse?.responseMsg === 'string'
        ? paymentResponse.responseMsg
        : typeof paymentResponse?.message === 'string'
          ? paymentResponse.message
          : checkoutUrl || receiveCode
            ? 'Confirm the payment in Ebirr, then return to POS-S.'
            : 'Confirm the payment request in Ebirr on the selected mobile line.';

    const approvedImmediately =
      paymentResponse?.errorCode === '0' &&
      paymentResponse?.params?.state === 'APPROVED';

    const normalizedReferralCode =
      typeof params.referralCode === 'string' && params.referralCode.trim()
        ? params.referralCode.trim().toUpperCase()
        : null;

    if (approvedImmediately) {
      await this.completeEbirrActivationPayment(
        referenceId,
        option.period,
        normalizedReferralCode,
      );
    } else {
      // Stash the chosen period on the latest subscription so the async
      // Ebirr callback can recover it without parsing the reference again.
      await this.recordPendingPeriodOnSubscription(
        candidate.branchId,
        option,
        referenceId,
        normalizedReferralCode,
      );
    }

    return {
      branchId: candidate.branchId,
      branchName: candidate.branchName,
      referenceId,
      status: approvedImmediately ? 'ACTIVE' : 'PENDING_CONFIRMATION',
      subscriptionPeriod: option.period,
      amount: option.amount,
      currency: option.currency,
      checkoutUrl,
      receiveCode,
      providerMessage,
    };
  }

  private async recordPendingPeriodOnSubscription(
    branchId: number,
    option: PosBranchSubscriptionOption,
    referenceId: string,
    referralCode?: string | null,
  ): Promise<void> {
    const workspace =
      await this.retailEntitlementsService.getBranchWorkspaceStatus(branchId);
    if (!workspace.tenant) return;

    // Must use the SAME precedence as the reader in completeEbirrActivationPayment
    // (branch row, else the legacy tenant-wide row) — a plain `{ tenantId }`
    // lookup stamps the pending period onto a sibling branch's row, where the
    // reader never looks, and the payment silently completes as MONTHLY.
    const latest =
      (await this.tenantSubscriptionsRepository.findOne({
        where: { tenantId: workspace.tenant.id, branchId },
        order: { createdAt: 'DESC' },
      })) ??
      (await this.tenantSubscriptionsRepository.findOne({
        where: { tenantId: workspace.tenant.id, branchId: IsNull() },
        order: { createdAt: 'DESC' },
      }));
    if (!latest) return;

    latest.metadata = {
      ...(latest.metadata ?? {}),
      pendingActivation: {
        branchId,
        period: option.period,
        periodMonths: option.months,
        amountTotal: option.amount,
        currency: option.currency,
        referenceId,
        referralCode: referralCode ?? null,
      },
    };
    await this.tenantSubscriptionsRepository.save(latest);
  }

  async completeEbirrActivationPayment(
    referenceId: string,
    explicitPeriod?: PosBranchSubscriptionPeriod,
    explicitReferralCode?: string | null,
  ) {
    const branchId = this.parseBranchIdFromReference(referenceId);
    if (!branchId) {
      this.logger.warn(
        `Ignoring unsupported POS activation reference: ${referenceId}`,
      );
      return null;
    }

    const workspace =
      await this.retailEntitlementsService.getBranchWorkspaceStatus(branchId);

    if (!workspace.tenant) {
      throw new NotFoundException(
        `Branch ${branchId} is not linked to a retail tenant for POS activation.`,
      );
    }

    this.assertTenantGovernanceReady(workspace, {
      serviceFormat: workspace.branch?.serviceFormat,
    });

    const hasPosCore = workspace.entitlements.some(
      (entitlement) => entitlement.module === RetailModule.POS_CORE,
    );

    if (!hasPosCore) {
      throw new ForbiddenException(
        `Branch ${branchId} is missing POS_CORE entitlement for activation.`,
      );
    }

    // Per-branch subscription lookup. Each branch gets its own row.
    const branchSubscription = await this.tenantSubscriptionsRepository.findOne(
      {
        where: { tenantId: workspace.tenant.id, branchId },
        order: { createdAt: 'DESC' },
      },
    );
    const tenantWideFallback = branchSubscription
      ? null
      : await this.tenantSubscriptionsRepository.findOne({
          // Legacy tenant-wide rows only — a sibling branch's row must never
          // stand in for this one.
          where: { tenantId: workspace.tenant.id, branchId: IsNull() },
          order: { createdAt: 'DESC' },
        });
    const reference = branchSubscription ?? tenantWideFallback;

    if (branchSubscription?.status === TenantSubscriptionStatus.ACTIVE) {
      return branchSubscription;
    }

    // Resolve the subscription period: explicit caller > pendingActivation >
    // the period stamped on the reference id > default. The reference suffix is
    // the safety net for a branch with NO subscription row at all — there,
    // recordPendingPeriodOnSubscription has nothing to write to, and falling
    // back to MONTHLY grants a month for a year that was already charged.
    const pendingMeta = reference?.metadata?.pendingActivation as
      | { period?: string; referenceId?: string }
      | undefined;
    const resolvedPeriod: PosBranchSubscriptionPeriod =
      explicitPeriod ??
      (findPosBranchSubscriptionOption(pendingMeta?.period)?.period ||
        findPosBranchSubscriptionOption(
          this.parsePeriodFromReference(referenceId),
        )?.period ||
        DEFAULT_POS_BRANCH_PERIOD);
    const option = requirePosBranchSubscriptionOption(resolvedPeriod);
    const billingInterval =
      option.period === 'ONE_YEAR'
        ? TenantBillingInterval.ONE_YEAR
        : TenantBillingInterval.MONTHLY;

    const now = new Date();
    // Payment ends the trial there and then: the paid period starts today, not
    // at the trial's tail. Stacking the two made sense at 14 days; at six free
    // months it would park a paid year half a year out, and an owner who pays
    // in month one would not see the subscription they just bought begin until
    // month seven. The remaining free days are given up — the copy on both the
    // pay screens and the reminder email says so.
    const convertedFromLiveTrial = isLivePosSelfServeTrial(
      branchSubscription,
      now.getTime(),
    );
    // Read before the writes below: the trial row is converted IN PLACE, so
    // `branchSubscription.endsAt` becomes the paid end date a few lines on.
    const trialWouldHaveEndedAt =
      convertedFromLiveTrial && branchSubscription?.endsAt
        ? new Date(branchSubscription.endsAt).toISOString()
        : null;
    const paidPeriodStartsAt = now.getTime();
    const nextSubscription =
      branchSubscription ??
      this.tenantSubscriptionsRepository.create({
        tenantId: workspace.tenant.id,
        branchId,
      });

    nextSubscription.tenantId = workspace.tenant.id;
    nextSubscription.branchId = branchId;
    nextSubscription.planCode = option.planCode;
    nextSubscription.status = TenantSubscriptionStatus.ACTIVE;
    nextSubscription.billingInterval = billingInterval;
    nextSubscription.amount = POS_BRANCH_SUBSCRIPTION_MONTHLY_EQUIVALENT;
    nextSubscription.amountTotal = option.amount;
    nextSubscription.periodMonths = option.months;
    nextSubscription.currency = option.currency;
    // startsAt records when they paid, which is also when the paid term begins.
    nextSubscription.startsAt = now;
    nextSubscription.endsAt = new Date(
      paidPeriodStartsAt + option.months * 30 * 86_400_000,
    );
    nextSubscription.autoRenew = true;
    nextSubscription.metadata = {
      ...(branchSubscription?.metadata || {}),
      lastActivationReferenceId: referenceId,
      lastActivationPaymentMethod: 'EBIRR',
      lastActivatedAt: now.toISOString(),
      posWorkspacePlanCode: option.planCode,
      subscriptionPeriod: option.period,
      periodMonths: option.months,
      amountTotal: option.amount,
      branchId,
      pendingActivation: undefined,
      // Conversion overwrites planCode, so the row itself stops answering "did
      // this start life on the free trial?". These two keep that answerable,
      // and record the free time the owner chose to end early.
      ...(convertedFromLiveTrial
        ? {
            convertedFromTrialAt: now.toISOString(),
            trialWouldHaveEndedAt,
          }
        : {}),
    };

    const saved =
      await this.tenantSubscriptionsRepository.save(nextSubscription);

    // Resolve the referral code: explicit caller > pendingActivation metadata.
    const pendingReferralCode =
      typeof (pendingMeta as any)?.referralCode === 'string'
        ? ((pendingMeta as any).referralCode as string)
        : null;
    const resolvedReferralCode =
      (typeof explicitReferralCode === 'string' && explicitReferralCode.trim()
        ? explicitReferralCode.trim().toUpperCase()
        : null) ||
      (pendingReferralCode ? pendingReferralCode.trim().toUpperCase() : null);

    if (resolvedReferralCode) {
      void (async () => {
        try {
          const partner =
            await this.equityPartnerService.findActivePartnerByReferralCode(
              resolvedReferralCode,
            );
          if (partner) {
            await this.equityPartnerService.recordReferralFromActivation(
              partner.id,
              branchId,
              workspace.tenant.id,
            );
          }
        } catch (err: any) {
          this.logger.warn(
            `Equity referral link failed for branch ${branchId}: ${err?.message}`,
          );
        }
      })();
    }

    // Generate equity payouts proportional to the full subscription period.
    const periodStart = saved.startsAt ?? now;
    const periodEnd =
      saved.endsAt ??
      new Date(periodStart.getTime() + option.months * 30 * 86_400_000);
    void this.equityPartnerService
      .createMonthlyPayoutsForBranch(
        branchId,
        periodStart,
        periodEnd,
        option.amount,
        option.currency,
      )
      .catch((err: any) =>
        this.logger.warn(
          `Equity payout creation failed for branch ${branchId}: ${err?.message}`,
        ),
      );

    return saved;
  }

  isPosWorkspaceActivationReference(referenceId: string | null | undefined) {
    return String(referenceId || '').startsWith(
      `${POS_WORKSPACE_REFERENCE_PREFIX}-`,
    );
  }

  isBranchCreationPaymentReference(referenceId: string | null | undefined) {
    return String(referenceId || '').startsWith(
      `${BRANCH_CREATE_REFERENCE_PREFIX}-`,
    );
  }

  async startAdditionalBranchCreationPayment(
    user: { id: number; roles?: string[]; email?: string | null },
    dto: {
      branchName: string;
      serviceFormat: string;
      city?: string;
      country?: string;
      address?: string;
      defaultCurrency?: string;
      phoneNumber: string;
      phone?: string;
      tinNumber?: string;
      referralCode?: string;
      ownerEmail?: string;
      subscriptionPeriod?: string;
    },
  ) {
    // Resolve the user's tenant via their branch assignments
    const assignments = await this.branchStaffAssignmentsRepository.find({
      where: { userId: user.id, isActive: true },
    });
    if (!assignments.length) {
      throw new ForbiddenException(
        'No active branch assignments found. Create a first branch before adding more.',
      );
    }
    const branchIds = assignments.map((a) => a.branchId);
    const existingBranches = await this.branchesRepository.find({
      where: { id: In(branchIds) },
      select: ['id', 'retailTenantId'],
    });
    const tenantId = existingBranches.find(
      (b) => b.retailTenantId,
    )?.retailTenantId;
    if (!tenantId) {
      throw new ForbiddenException(
        'No retail tenant found. Create a first branch before adding more.',
      );
    }

    // Verify the tenant has an active or trial subscription.
    // Deliberately TENANT-WIDE, unlike the per-branch lookups elsewhere: the
    // question here is "does this tenant pay for anything yet", not "what
    // governs branch X". Do not branch-scope this.
    const subscription = await this.tenantSubscriptionsRepository.findOne({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    const activeStatuses = new Set([
      TenantSubscriptionStatus.ACTIVE,
      TenantSubscriptionStatus.TRIAL,
    ]);
    if (!subscription || !activeStatuses.has(subscription.status)) {
      throw new ForbiddenException(
        'An active or trial subscription is required before adding another branch. Activate your first branch first.',
      );
    }

    const branchName = dto.branchName.trim();
    const referenceId = `${BRANCH_CREATE_REFERENCE_PREFIX}-${tenantId}-${user.id}-${Date.now()}`;
    const invoiceId = `${BRANCH_CREATE_REFERENCE_PREFIX}INV-${tenantId}-${Date.now()}`;

    // Resolve the billing period the caller chose (Monthly or 1-year −10%),
    // defaulting to the monthly plan when omitted. The period is persisted in
    // the pending metadata so completion charges/pays out the matching amount.
    const additionalBranchOption =
      findPosBranchSubscriptionOption(dto.subscriptionPeriod) ??
      requirePosBranchSubscriptionOption(DEFAULT_POS_BRANCH_PERIOD);

    // Store pending creation params in subscription metadata
    subscription.metadata = {
      ...(subscription.metadata ?? {}),
      pendingBranchCreation: {
        referenceId,
        branchName,
        serviceFormat: dto.serviceFormat,
        city: dto.city ?? null,
        country: dto.country ?? null,
        address: dto.address ?? null,
        defaultCurrency: dto.defaultCurrency ?? 'ETB',
        phone: dto.phone?.trim() ?? null,
        tinNumber: dto.tinNumber?.trim() ?? null,
        referralCode: dto.referralCode?.trim().toUpperCase() ?? null,
        userEmail: user.email?.trim() ?? null,
        ownerEmail: dto.ownerEmail?.trim().toLowerCase() ?? null,
        period: additionalBranchOption.period,
        createdBranchId: null,
      },
    };
    await this.tenantSubscriptionsRepository.save(subscription);

    // Expire any stale PENDING/INITIATED POSBRANCH transactions for this
    // tenant+user before initiating a new one. Multiple pending transactions
    // for the same phone number cause Ebirr to return E102051 Gateway Timeout.
    const staleTxPrefix = `${BRANCH_CREATE_REFERENCE_PREFIX}-${tenantId}-${user.id}-`;
    await this.ebirrService
      .expireStalePendingTransactionsForPrefix(staleTxPrefix)
      .catch((err: any) =>
        this.logger.warn(
          `Failed to expire stale branch transactions for ${staleTxPrefix}: ${err?.message}`,
        ),
      );

    let paymentResponse: any;
    try {
      paymentResponse = await this.ebirrService.initiatePayment({
        phoneNumber: dto.phoneNumber,
        amount: additionalBranchOption.amount.toFixed(2),
        referenceId,
        invoiceId,
        description: `New branch "${branchName}" activation (${additionalBranchOption.label}) for tenant ${tenantId}`,
      });
    } catch (payErr: any) {
      const providerCode = String(payErr?.providerCode || '').trim();
      const isRecoverableGatewayTimeout =
        payErr?.isEbirrTimeout ||
        providerCode === 'E102051' ||
        /gateway timeout|transaction timeout/i.test(
          String(payErr?.message || ''),
        );

      if (isRecoverableGatewayTimeout) {
        // The subscription record is already persisted — the provider callback
        // can still complete branch creation if Ebirr settles after timing out.
        this.logger.warn(
          `Ebirr timeout on branch creation payment ${referenceId} — returning PENDING and waiting for provider confirmation`,
        );
        return {
          status: 'PENDING' as const,
          branchId: null,
          referenceId,
          checkoutUrl: null,
          receiveCode: null,
          providerMessage:
            'The payment request was sent but no confirmation was received from Ebirr. If you received a payment notification on your phone, complete it there and wait for provider confirmation to create the branch automatically.',
        };
      }
      throw payErr;
    }

    const rawCheckoutUrl =
      paymentResponse?.toPayUrl && typeof paymentResponse.toPayUrl === 'string'
        ? paymentResponse.toPayUrl.trim()
        : null;
    const checkoutUrl =
      rawCheckoutUrl && /^https?:\/\//i.test(rawCheckoutUrl)
        ? rawCheckoutUrl
        : null;
    const receiveCode =
      typeof paymentResponse?.receiverCode === 'string' &&
      paymentResponse.receiverCode.trim()
        ? paymentResponse.receiverCode.trim()
        : typeof paymentResponse?.ussd === 'string' &&
            paymentResponse.ussd.trim()
          ? paymentResponse.ussd.trim()
          : null;
    const providerMessage =
      typeof paymentResponse?.responseMsg === 'string'
        ? paymentResponse.responseMsg
        : typeof paymentResponse?.message === 'string'
          ? paymentResponse.message
          : checkoutUrl || receiveCode
            ? 'Complete the payment in Ebirr and wait for provider confirmation to create the branch automatically.'
            : 'Confirm the payment request in Ebirr on the selected mobile line and wait for provider confirmation.';

    const approvedImmediately =
      paymentResponse?.errorCode === '0' &&
      paymentResponse?.params?.state === 'APPROVED';

    if (approvedImmediately) {
      const created = await this.completeBranchCreationPayment(referenceId);
      return {
        status: 'CREATED' as const,
        branchId: created.branchId,
        referenceId,
        checkoutUrl: null,
        receiveCode: null,
        providerMessage: `Branch "${branchName}" has been created and is ready.`,
      };
    }

    return {
      status: 'PENDING' as const,
      branchId: null,
      referenceId,
      checkoutUrl,
      receiveCode,
      providerMessage,
    };
  }

  async completeBranchCreationPayment(
    referenceId: string,
  ): Promise<{ branchId: number; created: boolean }> {
    const parsed = this.parseBranchCreationReference(referenceId);
    if (!parsed) {
      this.logger.warn(
        `Cannot parse branch creation reference: ${referenceId}`,
      );
      return { branchId: 0, created: false };
    }
    const { tenantId, userId } = parsed;

    // Deliberately TENANT-WIDE: `pendingBranchCreation` is a tenant-level
    // handshake (the branch does not exist yet, so it cannot be branch-scoped),
    // and its writer uses the same tenant-latest row. Do not branch-scope this.
    const subscription = await this.tenantSubscriptionsRepository.findOne({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    const pending = subscription?.metadata?.pendingBranchCreation as
      | {
          referenceId?: string;
          branchName: string;
          serviceFormat: string;
          city?: string | null;
          country?: string | null;
          address?: string | null;
          userEmail?: string | null;
          ownerEmail?: string | null;
          period?: string | null;
          createdBranchId?: number | null;
        }
      | undefined;

    if (!pending?.branchName) {
      this.logger.warn(
        `No pending branch creation data for reference ${referenceId}`,
      );
      return { branchId: 0, created: false };
    }

    // Idempotency: already created
    if (pending.createdBranchId) {
      return { branchId: pending.createdBranchId, created: false };
    }

    // Resolve the billing period chosen at initiation (persisted in metadata)
    // so the equity-partner payout amount / description match what was charged.
    const additionalBranchOption =
      findPosBranchSubscriptionOption(pending.period) ??
      requirePosBranchSubscriptionOption(DEFAULT_POS_BRANCH_PERIOD);

    const code = await this.generateBranchCode(
      this.branchesRepository,
      pending.branchName,
    );

    // Resolve actual branch owner (may differ from the payment initiator)
    let ownerUserId = userId;
    const pendingOwnerEmail = pending.ownerEmail?.trim().toLowerCase();
    if (
      pendingOwnerEmail &&
      pendingOwnerEmail !== pending.userEmail?.trim().toLowerCase()
    ) {
      const targetOwner = await this.usersRepository.findOne({
        where: { email: pendingOwnerEmail },
        select: ['id'],
      });
      if (targetOwner) {
        ownerUserId = targetOwner.id;
      }
    }

    const branch = this.branchesRepository.create({
      name: pending.branchName,
      code,
      serviceFormat: pending.serviceFormat ?? 'RETAIL',
      ownerId: ownerUserId,
      retailTenantId: tenantId,
      address: pending.address ?? null,
      city: pending.city ?? null,
      country: pending.country ?? null,
      phone: (pending as any).phone ?? null,
      tinNumber: (pending as any).tinNumber ?? null,
      isActive: true,
    });
    const savedBranch = await this.branchesRepository.save(branch);

    await this.branchStaffAssignmentsRepository.save(
      this.branchStaffAssignmentsRepository.create({
        branchId: savedBranch.id,
        userId: ownerUserId,
        role: BranchStaffRole.MANAGER,
        permissions: [],
        isActive: true,
      }),
    );

    // If creator differs from owner, also keep creator as MANAGER
    if (ownerUserId !== userId) {
      await this.branchStaffAssignmentsRepository.save(
        this.branchStaffAssignmentsRepository.create({
          branchId: savedBranch.id,
          userId,
          role: BranchStaffRole.MANAGER,
          permissions: [],
          isActive: true,
        }),
      );
    }

    // Record the created branch ID for idempotency
    if (subscription) {
      subscription.metadata = {
        ...(subscription.metadata ?? {}),
        pendingBranchCreation: {
          ...pending,
          createdBranchId: savedBranch.id,
          createdAt: new Date().toISOString(),
        },
      };
      await this.tenantSubscriptionsRepository.save(subscription);
    }

    this.logger.log(
      `Branch ${savedBranch.id} "${savedBranch.name}" created via Ebirr payment ref ${referenceId}`,
    );

    // Link equity partner and generate first-month payout if a referral code was used
    const referralCode = (pending as any).referralCode as
      | string
      | null
      | undefined;
    if (referralCode) {
      void (async () => {
        try {
          const partner =
            await this.equityPartnerService.findActivePartnerByReferralCode(
              referralCode,
            );
          if (partner) {
            await this.equityPartnerService.createAssignment(
              partner.id,
              savedBranch.id,
              tenantId,
            );
            const now = new Date();
            const periodEnd = new Date(now.getTime() + 30 * 86_400_000);
            await this.equityPartnerService.createMonthlyPayoutsForBranch(
              savedBranch.id,
              now,
              periodEnd,
              additionalBranchOption.amount,
              POS_WORKSPACE_CURRENCY,
            );
          }
        } catch (err: any) {
          this.logger.warn(
            `Equity partner link failed for branch ${savedBranch.id}: ${err?.message}`,
          );
        }
      })();
    }

    // Send payment confirmation emails — non-fatal
    const tenantEmail = pending.userEmail ?? null;
    const branchOwnerEmail = pendingOwnerEmail ?? tenantEmail;
    const paidAt = new Date();
    const notifyParams = {
      tenantEmail: tenantEmail ?? `Tenant #${tenantId}`,
      branchName: savedBranch.name,
      amount: additionalBranchOption.amount,
      currency: POS_WORKSPACE_CURRENCY,
      referenceId,
      branchId: savedBranch.id,
      paidAt,
    };
    if (tenantEmail) {
      void this.emailService
        .sendPosBranchCreatedEmail({
          ...notifyParams,
          to: tenantEmail,
          isAdmin: false,
        })
        .catch((err: any) =>
          this.logger.warn(
            `Branch created email to tenant failed: ${err?.message}`,
          ),
        );
    }
    // If the branch owner is different from the payment initiator, notify them too
    if (branchOwnerEmail && branchOwnerEmail !== tenantEmail) {
      void this.emailService
        .sendBranchActivationPaymentEmail({
          to: branchOwnerEmail,
          ownerEmail: branchOwnerEmail,
          branchName: savedBranch.name,
          branchId: savedBranch.id,
          amount: additionalBranchOption.amount,
          currency: POS_WORKSPACE_CURRENCY,
          referenceId,
          paidAt,
        })
        .catch((err: any) =>
          this.logger.warn(
            `Branch activation email to owner failed: ${err?.message}`,
          ),
        );
    }
    void this.emailService
      .sendPosBranchCreatedEmail({
        ...notifyParams,
        to: 'admin@suuqsapp.com',
        isAdmin: true,
      })
      .catch((err: any) =>
        this.logger.warn(
          `Branch created email to admin failed: ${err?.message}`,
        ),
      );

    return { branchId: savedBranch.id, created: true };
  }

  /** Reads the period suffix off a `POSACT-<branchId>-<ts>-<PERIOD>` reference. */
  private parsePeriodFromReference(referenceId: string): string | null {
    const match = String(referenceId || '').match(
      /^POSACT-\d+-\d+-([A-Z_]+)$/u,
    );
    return match?.[1] ?? null;
  }

  private parseBranchIdFromReference(referenceId: string): number | null {
    const match = String(referenceId || '').match(/^POSACT-(\d+)-/u);
    if (!match?.[1]) {
      return null;
    }

    const branchId = Number.parseInt(match[1], 10);
    return Number.isInteger(branchId) && branchId > 0 ? branchId : null;
  }

  private async getPayableActivationCandidate(
    user: { id: number; roles?: string[] },
    branchId: number,
  ) {
    const candidates =
      await this.branchStaffService.getPosWorkspaceActivationCandidatesForUser(
        user,
      );
    let candidate: PayableActivationTarget | null =
      candidates.find((entry) => entry.branchId === branchId) ?? null;

    if (!candidate) {
      // A branch on a live free trial is OPEN, so it is not an activation
      // candidate — but its owner may convert early rather than wait to be
      // locked out. `canPayNow` on the branch summary is the signal.
      const summaries =
        await this.branchStaffService.getPosBranchSummariesForUser(user);
      const convertibleTrial = summaries.find(
        (entry) => entry.branchId === branchId && entry.canPayNow,
      );
      if (convertibleTrial) {
        candidate = convertibleTrial;
      }
    }

    if (!candidate) {
      throw new NotFoundException(
        `Branch ${branchId} is not available for POS activation for this account.`,
      );
    }

    if (!candidate.isOwner && candidate.role !== BranchStaffRole.MANAGER) {
      throw new ForbiddenException(
        'Only a branch owner or manager can activate POS billing for this workspace.',
      );
    }

    if (!candidate.canPayNow) {
      throw new ForbiddenException(
        `Branch ${branchId} cannot start payment while workspace status is ${candidate.workspaceStatus}.`,
      );
    }

    if (!candidate.retailTenantId) {
      throw new ForbiddenException(
        `Branch ${branchId} is not linked to a retail tenant for POS activation.`,
      );
    }

    const workspace =
      await this.retailEntitlementsService.getBranchWorkspaceStatus(branchId);

    this.assertTenantGovernanceReady(workspace, {
      serviceFormat: candidate.serviceFormat || workspace.branch?.serviceFormat,
    });

    const posEntitlement =
      await this.tenantModuleEntitlementsRepository.findOne({
        where: {
          tenantId: candidate.retailTenantId,
          module: RetailModule.POS_CORE,
        },
      });

    if (!posEntitlement?.enabled) {
      throw new ForbiddenException(
        'POS_CORE entitlement must be enabled before payment can be collected for this branch workspace.',
      );
    }

    return candidate;
  }

  private normalizeServiceFormat(value?: string | null) {
    const normalized = String(value || '')
      .trim()
      .toUpperCase();

    if (!normalized) {
      return null;
    }

    if (
      ![
        'RETAIL',
        'HOTEL',
        'PHARMACY',
        'GROCERY',
        'BAKERY',
        'LAUNDRY',
        'BUTCHERY',
        'GAS_STATION',
        'ELECTRONICS',
        'QSR',
        'CAFETERIA',
        'PROPERTY_RENTAL',
        'BARBER',
        'PRINTING_PRESS',
      ].includes(normalized)
    ) {
      return null;
    }

    return normalized;
  }

  private assertTenantGovernanceReady(
    workspace: {
      branch?: { serviceFormat?: string | null };
      governance?: {
        activationReadiness?: { canActivate?: boolean; blockers?: string[] };
      } | null;
    },
    options: { serviceFormat?: string | null } = {},
  ) {
    if (workspace.governance?.activationReadiness?.canActivate) {
      return;
    }

    const hasServiceFormat = Boolean(
      this.normalizeServiceFormat(
        options.serviceFormat || workspace.branch?.serviceFormat || null,
      ),
    );
    const blockers = (
      workspace.governance?.activationReadiness?.blockers || []
    ).filter(
      (blocker) =>
        !(
          hasServiceFormat &&
          (blocker === PRIMARY_RETAIL_CATEGORY_BLOCKER ||
            blocker === POS_FIT_CATEGORY_BLOCKER)
        ),
    );

    if (blockers.length === 0) {
      return;
    }

    const blockerMessage =
      blockers[0] ||
      'Tenant governance setup is incomplete for POS activation.';

    throw new ForbiddenException(blockerMessage);
  }

  private parseBranchCreationReference(
    referenceId: string,
  ): { tenantId: number; userId: number } | null {
    const match = String(referenceId || '').match(/^POSBRANCH-(\d+)-(\d+)-/u);
    if (!match?.[1] || !match?.[2]) return null;
    const tenantId = Number.parseInt(match[1], 10);
    const userId = Number.parseInt(match[2], 10);
    return Number.isInteger(tenantId) &&
      tenantId > 0 &&
      Number.isInteger(userId) &&
      userId > 0
      ? { tenantId, userId }
      : null;
  }

  private async generateBranchCode(
    repo: Repository<Branch>,
    branchName: string,
  ): Promise<string> {
    const base =
      branchName
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((token) => token.slice(0, 3))
        .join('')
        .slice(0, 9) || 'BRANCH';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const suffix = `${Date.now()}`.slice(-6);
      const code = `${base}-${suffix}${attempt ? `-${attempt}` : ''}`.slice(
        0,
        64,
      );
      const existing = await repo.findOne({ where: { code } });
      if (!existing) return code;
    }
    throw new Error('Could not generate a unique branch code.');
  }

  private formatDisplayDate(value: Date) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(value);
  }
}
