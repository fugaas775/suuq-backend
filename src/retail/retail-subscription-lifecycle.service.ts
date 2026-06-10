import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from './entities/tenant-subscription.entity';
import { RetailTenant } from './entities/retail-tenant.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

const RENEWAL_REMINDER_DAYS = 3;
const DAY_MS = 86_400_000;

/**
 * Daily lifecycle pass for per-branch POS subscriptions. With the monthly plan
 * now the headline option, branches roll over far more often, so the platform
 * must (a) move lapsed ACTIVE subscriptions to EXPIRED promptly and (b) warn
 * owners a few days ahead so they can re-pay via Ebirr.
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

  /** Move ACTIVE subscriptions whose term has ended to EXPIRED. */
  async expireOverdueSubscriptions(now: Date): Promise<number> {
    const overdue = await this.subscriptionsRepo.find({
      where: {
        status: TenantSubscriptionStatus.ACTIVE,
        endsAt: LessThan(now),
      },
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
    return overdue.length;
  }

  /** Send a one-time renewal reminder for subscriptions ending soon. */
  async sendUpcomingRenewalReminders(now: Date): Promise<number> {
    const windowEnd = new Date(now.getTime() + RENEWAL_REMINDER_DAYS * DAY_MS);
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
      // Idempotency: do not re-notify for the same term end.
      if (meta.renewalReminderSentForEndsAt === endsAtIso) {
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
        },
      });

      sub.metadata = { ...meta, renewalReminderSentForEndsAt: endsAtIso };
      await this.subscriptionsRepo.save(sub);
      sent += 1;
    }

    if (sent) {
      this.logger.log(`Sent ${sent} POS subscription renewal reminder(s).`);
    }
    return sent;
  }

  private async resolveOwnerUserId(tenantId: number): Promise<number | null> {
    const tenant = await this.tenantsRepo.findOne({ where: { id: tenantId } });
    return tenant?.ownerUserId ?? null;
  }
}
