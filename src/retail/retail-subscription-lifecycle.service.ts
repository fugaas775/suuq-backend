import { Injectable, Logger, Optional } from '@nestjs/common';
import { SubscriptionPaymentMailerService } from '../subscription-payments/subscription-payment-mailer.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, Repository } from 'typeorm';
import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';
import { RetailTenant } from './entities/retail-tenant.entity';
import { POS_SELF_SERVE_TRIAL_PLAN_CODES } from './pos-self-serve-trial.policy';
import { NotificationsService } from '../notifications/notifications.service';
import { getPosPaidGraceDays } from '../branch-staff/pos-branch-renewal.policy';
import {
  POS_BRANCH_STARTER_OPTION,
  POS_BRANCH_SUBSCRIPTION_MONTHLY_EQUIVALENT,
  POS_BRANCH_SUBSCRIPTION_OPTIONS,
} from '../branch-staff/pos-workspace-pricing';
import { monthlyEquivalent } from './subscription-summary';
import { NotificationType } from '../notifications/entities/notification.entity';

/**
 * How many days before a PAID term ends we warn the owner: a week out, three
 * days out, and the day before. A term can be renewed from 30 days ahead with
 * no paid day lost, so each of these is a reminder the owner can act on.
 *
 * Paid subscriptions only. A free workspace is never warned that its free period
 * is running out — see the note on this service's class doc.
 */
const PAID_REMINDER_DAYS = [7, 3, 1];
const MAX_REMINDER_DAYS = Math.max(...PAID_REMINDER_DAYS);
const DAY_MS = 86_400_000;
/** How far ahead a free workspace is told, once, that it can be paid for. */
const FREE_PAY_AHEAD_NOTICE_DAYS = 30;
const RENEWAL_PRICES = POS_BRANCH_SUBSCRIPTION_OPTIONS.map((option) => ({
  label: option.label,
  amount: option.amount,
  currency: option.currency,
}));

/**
 * Daily lifecycle pass for per-branch POS subscriptions. With the monthly plan
 * now the headline option, branches roll over far more often, so the platform
 * must (a) move lapsed ACTIVE subscriptions to EXPIRED promptly and (b) warn
 * owners a few days ahead so they can pay for the next term.
 *
 * Free periods ride the same expiry pass. They are singled out by plan code
 * rather than by status: a hand-set TRIAL row (an admin extending someone
 * indefinitely) must keep its old open-ended meaning, while a granted free
 * period is a real term that expires and takes the workspace with it.
 *
 * They are NOT reminded, by email or in-app — deliberately, by product
 * decision — with one exception: a single notice thirty days out that the
 * branch can be paid for with no free day lost (sendFreePeriodPayAheadNotices). The free period simply runs out and the branch lands on the
 * paywall, which explains itself. Do not add a countdown nudge back here: the
 * absence is the requirement, not an oversight. Seller HQ and the register still
 * show the remaining days to an owner who opens them.
 *
 * Every term is paid by a transfer the owner makes — there is no auto-debit
 * mandate — so paid renewal is "prepaid term + reminder", not silent
 * auto-charge. That reminder stays: a paying customer is owed one.
 */
@Injectable()
export class RetailSubscriptionLifecycleService {
  private readonly logger = new Logger(RetailSubscriptionLifecycleService.name);

  constructor(
    @InjectRepository(TenantSubscription)
    private readonly subscriptionsRepo: Repository<TenantSubscription>,
    @InjectRepository(RetailTenant)
    private readonly tenantsRepo: Repository<RetailTenant>,
    private readonly notificationsService: NotificationsService,
    @Optional()
    private readonly mailer?: SubscriptionPaymentMailerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleSubscriptionLifecycle(): Promise<void> {
    const now = new Date();
    try {
      await this.expireOverdueSubscriptions(now);
      await this.sendUpcomingRenewalReminders(now);
      await this.sendGraceNotices(now);
      await this.sendFreePeriodPayAheadNotices(now);
    } catch (err) {
      this.logger.error('POS subscription lifecycle pass failed', err as Error);
    }
  }

  /**
   * Move subscriptions whose term has ended to EXPIRED — paid ones, and the
   * auto-provisioned trials.
   *
   * Persisting matters: every stored-status query (admin filters, the
   * additional-branch gate) reads the row, not the read-time rewrite in
   * resolveEffectiveSubscriptionStatus, so a lapsed trial left as TRIAL keeps
   * buying things it should not.
   *
   * `LessThan(now)` excludes `endsAt IS NULL` in SQL, so an open-ended row is
   * never swept up.
   */
  async expireOverdueSubscriptions(now: Date): Promise<number> {
    // A paid term is expired only once its grace days are spent; until then
    // the branch is still trading and the row must keep saying so. A free
    // period has no grace and expires on its end date.
    const paidCutoff = new Date(now.getTime() - getPosPaidGraceDays() * DAY_MS);
    const overdue = await this.subscriptionsRepo.find({
      where: [
        {
          status: TenantSubscriptionStatus.ACTIVE,
          endsAt: LessThan(paidCutoff),
        },
        {
          status: TenantSubscriptionStatus.TRIAL,
          planCode: In([...POS_SELF_SERVE_TRIAL_PLAN_CODES]),
          endsAt: LessThan(now),
        },
      ],
    });
    if (!overdue.length) {
      return 0;
    }

    for (const sub of overdue) {
      sub.status = TenantSubscriptionStatus.EXPIRED;
    }
    await this.subscriptionsRepo.save(overdue);
    this.logger.log(
      `Expired ${overdue.length} overdue POS branch subscription(s).`,
    );

    // No "your free period has ended" announcement. The branch drops to the
    // paywall on its own and that screen says what to do.
    return overdue.length;
  }

  /**
   * Remind owners of PAID subscriptions ending soon, once per milestone.
   *
   * Free periods are excluded at the query — not filtered later — so there is no
   * arrangement of flags that can put a free workspace back in this loop. A
   * branch running on its free period is never told the free period is about to
   * end; it simply lands on the paywall the day it does.
   */
  async sendUpcomingRenewalReminders(now: Date): Promise<number> {
    const windowEnd = new Date(now.getTime() + MAX_REMINDER_DAYS * DAY_MS);
    const dueSoon = await this.subscriptionsRepo.find({
      where: {
        status: TenantSubscriptionStatus.ACTIVE,
        endsAt: Between(now, windowEnd),
      },
    });

    // A branch whose next term is already on the books (renewed early, or
    // extended by an admin) is not "due": its running row is ending, but a later
    // one takes over. Reminding it to pay again would be asking for money twice.
    const branchIds = Array.from(
      new Set(
        dueSoon
          .map((sub) => sub.branchId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    const laterRows = branchIds.length
      ? ((await this.subscriptionsRepo.find({
          where: {
            status: TenantSubscriptionStatus.ACTIVE,
            branchId: In(branchIds),
          },
        })) ?? [])
      : [];
    const isSuperseded = (sub: TenantSubscription) =>
      sub.branchId != null &&
      laterRows.some(
        (other) =>
          other.id !== sub.id &&
          other.branchId === sub.branchId &&
          (!other.endsAt || other.endsAt.getTime() > sub.endsAt.getTime()),
      );

    let sent = 0;
    for (const sub of dueSoon) {
      if (!sub.endsAt || isSuperseded(sub)) {
        continue;
      }
      const endsAtIso = sub.endsAt.toISOString();
      const meta = sub.metadata || {};
      const alreadySent = this.readSentMilestones(meta, endsAtIso);
      const milestone = this.resolveDueMilestone(
        sub.endsAt.getTime() - now.getTime(),
        PAID_REMINDER_DAYS,
        alreadySent,
      );
      if (milestone == null) {
        continue;
      }
      const ownerUserId = await this.resolveOwnerUserId(sub.tenantId);
      if (!ownerUserId) {
        continue;
      }

      await this.notificationsService.createAndDispatch({
        userId: ownerUserId,
        title: 'POS subscription renewal due soon',
        body: `Your branch POS subscription ends on ${sub.endsAt.toDateString()}. Renew now from Billing — the new term is added after your current one, so no paid day is lost.`,
        type: NotificationType.ACCOUNT,
        data: {
          kind: 'POS_SUBSCRIPTION_RENEWAL',
          subscriptionId: sub.id,
          branchId: sub.branchId ?? null,
          endsAt: endsAtIso,
          daysLeft: milestone,
        },
      });
      // The same reminder by email — a paying owner who is not in the app that
      // week still has to hear that the term is ending. Paid terms only: this
      // loop never sees a free period.
      void this.mailer?.renewalDue({
        ownerUserId,
        branchId: sub.branchId ?? null,
        endsAt: sub.endsAt,
        daysLeft: milestone,
        prices: RENEWAL_PRICES,
        // A term sold at an older rate is told the rate has changed, here and
        // not at the moment of paying.
        previousMonthlyRate: monthlyEquivalent(sub),
        currentMonthlyRate: POS_BRANCH_SUBSCRIPTION_MONTHLY_EQUIVALENT,
      });

      sub.metadata = {
        ...meta,
        lifecycleRemindersSent: {
          endsAt: endsAtIso,
          milestones: [...alreadySent, milestone].sort((a, b) => b - a),
        },
      };
      await this.subscriptionsRepo.save(sub);
      sent += 1;
    }

    if (sent) {
      this.logger.log(`Sent ${sent} POS subscription renewal reminder(s).`);
    }
    return sent;
  }

  /**
   * Tell the owner of a PAID branch whose term has just ended that the tills
   * are still open, until when, and that paying now loses nothing. Once per
   * term end. Free periods never reach this: they are TRIAL rows, not ACTIVE.
   */
  async sendGraceNotices(now: Date): Promise<number> {
    const graceDays = getPosPaidGraceDays();
    if (graceDays <= 0) return 0;
    const ended =
      (await this.subscriptionsRepo.find({
        where: {
          status: TenantSubscriptionStatus.ACTIVE,
          endsAt: Between(new Date(now.getTime() - graceDays * DAY_MS), now),
        },
      })) ?? [];
    if (!ended.length) return 0;

    const branchIds = Array.from(
      new Set(
        ended
          .map((sub) => sub.branchId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    const others = branchIds.length
      ? ((await this.subscriptionsRepo.find({
          where: {
            status: TenantSubscriptionStatus.ACTIVE,
            branchId: In(branchIds),
          },
        })) ?? [])
      : [];

    let sent = 0;
    for (const sub of ended) {
      if (!sub.endsAt) continue;
      const endsAtIso = sub.endsAt.toISOString();
      const meta = sub.metadata || {};
      if (meta.graceNoticeSentForEndsAt === endsAtIso) continue;
      const renewed = others.some(
        (other) =>
          other.id !== sub.id &&
          other.branchId === sub.branchId &&
          (!other.endsAt || other.endsAt.getTime() > sub.endsAt.getTime()),
      );
      if (renewed) continue;
      const ownerUserId = await this.resolveOwnerUserId(sub.tenantId);
      if (!ownerUserId) continue;

      const graceEndsAt = new Date(sub.endsAt.getTime() + graceDays * DAY_MS);
      await this.notificationsService.createAndDispatch({
        userId: ownerUserId,
        title: 'POS subscription ended — pay to keep the tills open',
        body: `Your branch POS subscription ended on ${sub.endsAt.toDateString()}. The tills stay open until ${graceEndsAt.toDateString()}. Pay now from Billing to continue without interruption.`,
        type: NotificationType.ACCOUNT,
        data: {
          kind: 'POS_SUBSCRIPTION_GRACE',
          subscriptionId: sub.id,
          branchId: sub.branchId ?? null,
          endsAt: endsAtIso,
          graceEndsAt: graceEndsAt.toISOString(),
        },
      });
      void this.mailer?.termEnded({
        ownerUserId,
        branchId: sub.branchId ?? null,
        endsAt: sub.endsAt,
        graceEndsAt,
      });
      sub.metadata = { ...meta, graceNoticeSentForEndsAt: endsAtIso };
      await this.subscriptionsRepo.save(sub);
      sent += 1;
    }
    return sent;
  }

  /**
   * Tell the owner of a branch on its FREE period — once, thirty days out —
   * that it can be paid for at any time and the term begins when the free
   * period ends, so nothing is lost by paying early.
   *
   * This is the single exception to "a free workspace is never reminded"
   * (owner's decision, 21 November 2026). The reason is operational, not
   * promotional: every free period ends on the same night, payment is by
   * transfer verified by hand, and without this every one of those branches
   * would lock together and wait in one queue. It is sent once and never
   * repeated; there is still no countdown.
   */
  async sendFreePeriodPayAheadNotices(now: Date): Promise<number> {
    const windowEnd = new Date(
      now.getTime() + FREE_PAY_AHEAD_NOTICE_DAYS * DAY_MS,
    );
    const ending =
      (await this.subscriptionsRepo.find({
        where: {
          status: TenantSubscriptionStatus.TRIAL,
          planCode: In([...POS_SELF_SERVE_TRIAL_PLAN_CODES]),
          endsAt: Between(now, windowEnd),
        },
      })) ?? [];
    if (!ending.length) return 0;

    const branchIds = Array.from(
      new Set(
        ending
          .map((sub) => sub.branchId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    const paidRows = branchIds.length
      ? ((await this.subscriptionsRepo.find({
          where: {
            status: TenantSubscriptionStatus.ACTIVE,
            branchId: In(branchIds),
          },
        })) ?? [])
      : [];

    let sent = 0;
    for (const sub of ending) {
      if (!sub.endsAt) continue;
      const endsAtIso = sub.endsAt.toISOString();
      const meta = sub.metadata || {};
      if (meta.payAheadNoticeSentForEndsAt === endsAtIso) continue;
      // Already paid for what comes next: nothing to say.
      if (paidRows.some((row) => row.branchId === sub.branchId)) continue;
      const ownerUserId = await this.resolveOwnerUserId(sub.tenantId);
      if (!ownerUserId) continue;

      await this.notificationsService.createAndDispatch({
        userId: ownerUserId,
        title: 'Your free period ends soon',
        body: `Your free period ends on ${sub.endsAt.toDateString()}. You can pay from Billing at any time — the subscription begins when the free period ends, so no free day is lost.`,
        type: NotificationType.ACCOUNT,
        data: {
          kind: 'POS_FREE_PERIOD_PAY_AHEAD',
          subscriptionId: sub.id,
          branchId: sub.branchId ?? null,
          endsAt: endsAtIso,
        },
      });
      void this.mailer?.freePeriodCanBePaidAhead({
        ownerUserId,
        branchId: sub.branchId ?? null,
        endsAt: sub.endsAt,
        prices: [
          {
            label: POS_BRANCH_STARTER_OPTION.label,
            amount: POS_BRANCH_STARTER_OPTION.amount,
          },
          ...RENEWAL_PRICES,
        ],
      });
      sub.metadata = { ...meta, payAheadNoticeSentForEndsAt: endsAtIso };
      await this.subscriptionsRepo.save(sub);
      sent += 1;
    }
    if (sent) {
      this.logger.log(`Sent ${sent} free-period pay-ahead notice(s).`);
    }
    return sent;
  }

  /**
   * Milestones already notified for this exact term end. Reads the pre-milestone
   * key too, so a paid subscription that was reminded under the old scheme is
   * not reminded again the day this ships.
   */
  private readSentMilestones(
    meta: Record<string, any>,
    endsAtIso: string,
  ): number[] {
    if (meta.lifecycleRemindersSent?.endsAt === endsAtIso) {
      const milestones = meta.lifecycleRemindersSent.milestones;
      return Array.isArray(milestones) ? milestones.map(Number) : [];
    }
    if (meta.renewalReminderSentForEndsAt === endsAtIso) {
      return [...PAID_REMINDER_DAYS];
    }
    return [];
  }

  /**
   * The tightest milestone this row has already reached — e.g. 4 days left with
   * [30, 7, 3, 1] configured fires the 7-day nudge, 2 days left fires the 3-day
   * one. Returns null when that milestone has already been sent.
   *
   * Only the tightest one is ever a candidate. A wider milestone the row sailed
   * past (a trial first seen with 7 days left never had a 30-day moment) is
   * spent, not pending — treating it as pending would fire a second "30 days
   * left" nudge the day after the 7-day one.
   */
  private resolveDueMilestone(
    msLeft: number,
    milestones: number[],
    alreadySent: number[],
  ): number | null {
    const daysLeft = Math.max(0, Math.ceil(msLeft / DAY_MS));
    const reached = milestones
      .filter((day) => day >= daysLeft)
      .sort((left, right) => left - right)[0];

    if (reached == null || alreadySent.includes(reached)) {
      return null;
    }

    return reached;
  }

  private async resolveOwnerUserId(tenantId: number): Promise<number | null> {
    const tenant = await this.tenantsRepo.findOne({ where: { id: tenantId } });
    return tenant?.ownerUserId ?? null;
  }
}
