import { Injectable, Logger } from '@nestjs/common';
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
import { NotificationType } from '../notifications/entities/notification.entity';

/**
 * How many days before a PAID term ends we warn the owner.
 *
 * Paid subscriptions only. A free workspace is never warned that its free period
 * is running out — see the note on this service's class doc.
 */
const PAID_REMINDER_DAYS = [3];
const MAX_REMINDER_DAYS = Math.max(...PAID_REMINDER_DAYS);
const DAY_MS = 86_400_000;

/**
 * Daily lifecycle pass for per-branch POS subscriptions. With the monthly plan
 * now the headline option, branches roll over far more often, so the platform
 * must (a) move lapsed ACTIVE subscriptions to EXPIRED promptly and (b) warn
 * owners a few days ahead so they can re-pay via Ebirr.
 *
 * Free periods ride the same expiry pass. They are singled out by plan code
 * rather than by status: a hand-set TRIAL row (an admin extending someone
 * indefinitely) must keep its old open-ended meaning, while a granted free
 * period is a real term that expires and takes the workspace with it.
 *
 * They are NOT reminded, by email or in-app, at any point — deliberately, by
 * product decision. The free period simply runs out and the branch lands on the
 * paywall, which explains itself. Do not add a countdown nudge back here: the
 * absence is the requirement, not an oversight. Seller HQ and the register still
 * show the remaining days to an owner who opens them.
 *
 * Ebirr is a customer-initiated push payment — there is no stored auto-debit
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

    let sent = 0;
    for (const sub of dueSoon) {
      if (!sub.endsAt) {
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
        body: `Your branch POS subscription ends on ${sub.endsAt.toDateString()}. Renew via Ebirr to keep the workspace active.`,
        type: NotificationType.ACCOUNT,
        data: {
          kind: 'POS_SUBSCRIPTION_RENEWAL',
          subscriptionId: sub.id,
          branchId: sub.branchId ?? null,
          endsAt: endsAtIso,
          daysLeft: milestone,
        },
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
