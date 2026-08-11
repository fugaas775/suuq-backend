import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, Repository } from 'typeorm';
import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';
import { RetailTenant } from './entities/retail-tenant.entity';
import {
  isPosSelfServeTrialPlan,
  POS_SELF_SERVE_TRIAL_PLAN_CODES,
} from './pos-self-serve-trial.policy';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { EmailService } from '../email/email.service';
import { Branch } from '../branches/entities/branch.entity';
import { POS_BRANCH_SUBSCRIPTION_MONTHLY_EQUIVALENT } from '../branch-staff/pos-workspace-pricing';

/**
 * How many days before a term ends we warn the owner.
 *
 * A paid month gets one nudge; the free trial gets four, spread wider. Losing
 * the workspace is a bigger surprise than a renewal that lapses, and after six
 * months of free use the end date is long out of mind — the first nudge has to
 * land far enough out to be a plan rather than a scramble.
 */
const PAID_REMINDER_DAYS = [3];
const TRIAL_REMINDER_DAYS = [30, 7, 3, 1];
const MAX_REMINDER_DAYS = Math.max(
  ...PAID_REMINDER_DAYS,
  ...TRIAL_REMINDER_DAYS,
);
const DAY_MS = 86_400_000;

/**
 * Daily lifecycle pass for per-branch POS subscriptions. With the monthly plan
 * now the headline option, branches roll over far more often, so the platform
 * must (a) move lapsed ACTIVE subscriptions to EXPIRED promptly and (b) warn
 * owners a few days ahead so they can re-pay via Ebirr.
 *
 * Free trials ride the same pass. They are singled out by plan code rather than
 * by status: a hand-set TRIAL row (an admin extending someone indefinitely) must
 * keep its old open-ended meaning, while an auto-provisioned trial is a real
 * term that expires and takes the workspace with it.
 *
 * Ebirr is a customer-initiated push payment — there is no stored auto-debit
 * mandate — so renewal is "prepaid term + reminder", not silent auto-charge.
 */
@Injectable()
export class RetailSubscriptionLifecycleService {
  private readonly logger = new Logger(RetailSubscriptionLifecycleService.name);

  constructor(
    @InjectRepository(TenantSubscription)
    private readonly subscriptionsRepo: Repository<TenantSubscription>,
    @InjectRepository(RetailTenant)
    private readonly tenantsRepo: Repository<RetailTenant>,
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleSubscriptionLifecycle(): Promise<void> {
    const now = new Date();
    try {
      await this.expireOverdueSubscriptions(now);
      await this.sendUpcomingRenewalReminders(now);
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
    const overdue = await this.subscriptionsRepo.find({
      where: [
        {
          status: TenantSubscriptionStatus.ACTIVE,
          endsAt: LessThan(now),
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

    const lapsedTrials: TenantSubscription[] = [];
    for (const sub of overdue) {
      if (isPosSelfServeTrialPlan(sub)) {
        lapsedTrials.push(sub);
      }
      sub.status = TenantSubscriptionStatus.EXPIRED;
    }
    await this.subscriptionsRepo.save(overdue);
    this.logger.log(
      `Expired ${overdue.length} overdue POS branch subscription(s).`,
    );

    await this.notifyTrialsEnded(lapsedTrials);

    return overdue.length;
  }

  /** One-time "your free trial has ended" nudge, guarded per subscription. */
  private async notifyTrialsEnded(
    lapsedTrials: TenantSubscription[],
  ): Promise<void> {
    for (const sub of lapsedTrials) {
      const meta = sub.metadata || {};
      if (meta.trialEndedNotifiedAt) {
        continue;
      }
      const ownerUserId = await this.resolveOwnerUserId(sub.tenantId);
      if (!ownerUserId) {
        continue;
      }

      await this.notificationsService.createAndDispatch({
        userId: ownerUserId,
        title: 'Your POS free trial has ended',
        body: 'Pay the branch subscription with Ebirr to reopen this workspace.',
        type: NotificationType.ACCOUNT,
        data: {
          kind: 'POS_TRIAL_ENDED',
          subscriptionId: sub.id,
          branchId: sub.branchId ?? null,
        },
      });

      await this.sendTrialEmail({
        tenantId: sub.tenantId,
        branchId: sub.branchId ?? null,
        endsAt: sub.endsAt ?? new Date(),
        daysLeft: 0,
        hasEnded: true,
      });

      sub.metadata = {
        ...meta,
        trialEndedNotifiedAt: new Date().toISOString(),
      };
      await this.subscriptionsRepo.save(sub);
    }
  }

  /** Send reminders for subscriptions ending soon, once per milestone. */
  async sendUpcomingRenewalReminders(now: Date): Promise<number> {
    const windowEnd = new Date(now.getTime() + MAX_REMINDER_DAYS * DAY_MS);
    const dueSoon = await this.subscriptionsRepo.find({
      where: [
        {
          status: TenantSubscriptionStatus.ACTIVE,
          endsAt: Between(now, windowEnd),
        },
        {
          status: TenantSubscriptionStatus.TRIAL,
          planCode: In([...POS_SELF_SERVE_TRIAL_PLAN_CODES]),
          endsAt: Between(now, windowEnd),
        },
      ],
    });

    let sent = 0;
    for (const sub of dueSoon) {
      if (!sub.endsAt) {
        continue;
      }
      const isTrial = isPosSelfServeTrialPlan(sub);
      const endsAtIso = sub.endsAt.toISOString();
      const meta = sub.metadata || {};
      const alreadySent = this.readSentMilestones(meta, endsAtIso);
      const milestone = this.resolveDueMilestone(
        sub.endsAt.getTime() - now.getTime(),
        isTrial ? TRIAL_REMINDER_DAYS : PAID_REMINDER_DAYS,
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
        title: isTrial
          ? 'Your POS free trial is ending'
          : 'POS subscription renewal due soon',
        body: isTrial
          ? `Your free trial ends on ${sub.endsAt.toDateString()}. Pay the branch subscription with Ebirr to keep this workspace open.`
          : `Your branch POS subscription ends on ${sub.endsAt.toDateString()}. Renew via Ebirr to keep the workspace active.`,
        type: NotificationType.ACCOUNT,
        data: {
          kind: isTrial ? 'POS_TRIAL_ENDING' : 'POS_SUBSCRIPTION_RENEWAL',
          subscriptionId: sub.id,
          branchId: sub.branchId ?? null,
          endsAt: endsAtIso,
          daysLeft: milestone,
        },
      });

      if (isTrial) {
        await this.sendTrialEmail({
          tenantId: sub.tenantId,
          branchId: sub.branchId ?? null,
          endsAt: sub.endsAt,
          daysLeft: milestone,
        });
      }

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

  /**
   * Where to reach the owner off-app. The owner's account email first, then the
   * tenant's billing email — a tenant can be billed to an address that is not
   * anybody's login.
   */
  private async resolveOwnerContact(
    tenantId: number,
  ): Promise<{ userId: number | null; email: string | null }> {
    const tenant = await this.tenantsRepo.findOne({
      where: { id: tenantId },
      relations: { owner: true },
    });

    return {
      userId: tenant?.ownerUserId ?? null,
      email:
        tenant?.owner?.email?.trim() || tenant?.billingEmail?.trim() || null,
    };
  }

  private async resolveBranchName(branchId: number | null): Promise<string> {
    if (!branchId) {
      return 'your branch';
    }
    const branch = await this.branchesRepo.findOne({
      where: { id: branchId },
      select: { id: true, name: true },
    });
    return branch?.name?.trim() || `Branch #${branchId}`;
  }

  /**
   * Email is best-effort: a bounced or misconfigured mailer must never stop the
   * lifecycle pass (which also persists expiry) or the in-app notification.
   */
  private async sendTrialEmail(params: {
    tenantId: number;
    branchId: number | null;
    endsAt: Date;
    daysLeft: number;
    hasEnded?: boolean;
  }): Promise<void> {
    try {
      const contact = await this.resolveOwnerContact(params.tenantId);
      if (!contact.email) {
        return;
      }

      await this.emailService.sendPosTrialReminderEmail({
        to: contact.email,
        branchName: await this.resolveBranchName(params.branchId),
        branchId: params.branchId ?? 0,
        endsAt: params.endsAt,
        daysLeft: params.daysLeft,
        amount: POS_BRANCH_SUBSCRIPTION_MONTHLY_EQUIVALENT,
        hasEnded: params.hasEnded,
      });
    } catch (error) {
      this.logger.warn(
        `Trial email for tenant #${params.tenantId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
