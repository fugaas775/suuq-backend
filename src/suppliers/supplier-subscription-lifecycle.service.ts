import { SUPPLIER_SUBSCRIPTION_OPTIONS } from './supplier-subscription-pricing';
import { SubscriptionPaymentMailerService } from '../subscription-payments/subscription-payment-mailer.service';
import { getPosPaidGraceDays } from '../branch-staff/pos-branch-renewal.policy';

const DAY_MS = 86_400_000;
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, Not, Repository } from 'typeorm';
import { TenantSubscriptionStatus } from '../retail/entities/tenant-subscription.entity';
import {
  SupplierActivationStatus,
  SupplierProfile,
} from './entities/supplier-profile.entity';
import { SupplierSubscription } from './entities/supplier-subscription.entity';
import { SUPPLIER_FREE_PERIOD_PLAN_CODES } from './supplier-free-period.policy';

/**
 * Daily pass over supplier accounts opened on the free period.
 *
 * Without it a free supplier account stays ACTIVE for ever: `activationStatus`
 * is what every supplier gate reads (publishing offers, receiving purchase
 * orders, the cash & carry outlet), and nothing else moves it back. The
 * subscription row's `endsAt` alone changes nothing.
 *
 * It expires and says nothing. No countdown email, no in-app nudge, no "your
 * free account is ending" notice at any point — deliberately, by product
 * decision, and matching the POS side. The account simply closes on the deadline
 * and the billing page explains itself when the owner next opens it. Do not add
 * a reminder back here: the silence is the requirement, not an oversight.
 *
 * Paid terms follow the branch rules: a reminder by email 7, 3 and 1 days
 * before the end, a notice when the term ends that the account stays open for
 * the grace days, and then the account closes. Free periods still close on
 * their date without a word.
 */
@Injectable()
export class SupplierSubscriptionLifecycleService {
  private readonly logger = new Logger(
    SupplierSubscriptionLifecycleService.name,
  );

  constructor(
    @InjectRepository(SupplierSubscription)
    private readonly subscriptionsRepo: Repository<SupplierSubscription>,
    @InjectRepository(SupplierProfile)
    private readonly profilesRepo: Repository<SupplierProfile>,
    @Optional()
    private readonly mailer?: SubscriptionPaymentMailerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleSupplierSubscriptionLifecycle(): Promise<void> {
    const now = new Date();
    try {
      await this.expireLapsedFreePeriods(now);
      await this.sendPaidTermNotices(now);
    } catch (err) {
      this.logger.error(
        'Supplier subscription lifecycle pass failed',
        err as Error,
      );
    }
  }

  /**
   * Close the supplier accounts whose free period has run out.
   *
   * The profile is only moved when the lapsed row is still the account's newest
   * one. A supplier who paid mid-way has a newer ACTIVE row; expiring the old
   * free row must not knock the account they just bought back offline.
   */
  async expireLapsedFreePeriods(now: Date): Promise<number> {
    const lapsed = await this.subscriptionsRepo.find({
      where: [
        {
          status: TenantSubscriptionStatus.TRIAL,
          planCode: In([...SUPPLIER_FREE_PERIOD_PLAN_CODES]),
          endsAt: LessThan(now),
        },
        // A PAID term — the 14-day trial or a full one — closes once its
        // grace days are spent. Nothing used to expire these at all: a
        // wholesaler whose paid month ran out simply kept trading. (At the time
        // this was switched on, 21 November 2026, no supplier was past its end
        // date, so nobody was closed by surprise.) A supplier who renewed has
        // had this same row moved forward, so it is not matched.
        {
          status: TenantSubscriptionStatus.ACTIVE,
          planCode: Not(In([...SUPPLIER_FREE_PERIOD_PLAN_CODES])),
          endsAt: LessThan(
            new Date(now.getTime() - getPosPaidGraceDays() * DAY_MS),
          ),
        },
      ],
    });

    if (!lapsed.length) {
      return 0;
    }

    for (const sub of lapsed) {
      sub.status = TenantSubscriptionStatus.EXPIRED;
    }
    await this.subscriptionsRepo.save(lapsed);

    for (const sub of lapsed) {
      const newest = await this.subscriptionsRepo.findOne({
        where: { supplierProfileId: sub.supplierProfileId },
        order: { createdAt: 'DESC' },
      });

      if (newest && newest.id !== sub.id) {
        continue;
      }

      const profile = await this.profilesRepo.findOne({
        where: { id: sub.supplierProfileId },
      });

      if (!profile) {
        continue;
      }

      if (profile.activationStatus === SupplierActivationStatus.ACTIVE) {
        profile.activationStatus = SupplierActivationStatus.EXPIRED;
        await this.profilesRepo.save(profile);
      }
    }

    this.logger.log(
      `Expired ${lapsed.length} lapsed supplier free-period subscription(s).`,
    );

    return lapsed.length;
  }

  /**
   * Email the owner of a PAID supplier term that is about to end (7, 3, 1 days
   * out) or has just ended and is on its grace days. Once per milestone.
   */
  async sendPaidTermNotices(now: Date): Promise<number> {
    if (!this.mailer) return 0;
    const graceDays = getPosPaidGraceDays();
    const rows =
      (await this.subscriptionsRepo.find({
        where: {
          status: TenantSubscriptionStatus.ACTIVE,
          planCode: Not(In([...SUPPLIER_FREE_PERIOD_PLAN_CODES])),
          endsAt: Between(
            new Date(now.getTime() - graceDays * DAY_MS),
            new Date(now.getTime() + 7 * DAY_MS),
          ),
        },
      })) ?? [];

    let sent = 0;
    for (const sub of rows) {
      if (!sub.endsAt) continue;
      const profile = await this.profilesRepo.findOne({
        where: { id: sub.supplierProfileId },
      });
      if (!profile?.userId || profile.isActive === false) continue;

      const endsAtIso = sub.endsAt.toISOString();
      const meta = sub.metadata || {};
      const record =
        meta.lifecycleNotices?.endsAt === endsAtIso
          ? (meta.lifecycleNotices.sent as string[]) || []
          : [];
      const msLeft = sub.endsAt.getTime() - now.getTime();
      const daysLeft = Math.ceil(msLeft / DAY_MS);
      const milestone =
        msLeft <= 0
          ? 'ended'
          : String([1, 3, 7].find((day) => day >= daysLeft) ?? '');
      if (!milestone || record.includes(milestone)) continue;

      if (milestone === 'ended') {
        await this.mailer.termEnded({
          ownerUserId: profile.userId,
          subjectName: profile.companyName,
          endsAt: sub.endsAt,
          graceEndsAt: new Date(sub.endsAt.getTime() + graceDays * DAY_MS),
          supplier: true,
        });
      } else {
        await this.mailer.renewalDue({
          ownerUserId: profile.userId,
          subjectName: profile.companyName,
          endsAt: sub.endsAt,
          daysLeft: Number(milestone),
          prices: SUPPLIER_SUBSCRIPTION_OPTIONS.map((option) => ({
            label: option.label,
            amount: option.amount,
            currency: option.currency,
          })),
          supplier: true,
        });
      }
      sub.metadata = {
        ...meta,
        lifecycleNotices: { endsAt: endsAtIso, sent: [...record, milestone] },
      };
      await this.subscriptionsRepo.save(sub);
      sent += 1;
    }
    return sent;
  }
}
