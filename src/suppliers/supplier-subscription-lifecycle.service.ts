import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
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
 * Deliberately scoped to free-period rows. Lapsed PAID supplier subscriptions
 * are NOT swept: nothing has ever expired them, so a live wholesaler whose paid
 * month ran out months ago is still trading today, and closing them all in one
 * midnight pass is a business decision rather than a bug fix.
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
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleSupplierSubscriptionLifecycle(): Promise<void> {
    const now = new Date();
    try {
      await this.expireLapsedFreePeriods(now);
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
      where: {
        status: TenantSubscriptionStatus.TRIAL,
        planCode: In([...SUPPLIER_FREE_PERIOD_PLAN_CODES]),
        endsAt: LessThan(now),
      },
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
}
