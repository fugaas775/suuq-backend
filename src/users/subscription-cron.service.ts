import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import {
  User,
  SubscriptionTier,
  VerificationStatus,
} from './entities/user.entity';
import { Repository, LessThanOrEqual, DataSource } from 'typeorm';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { CurrencyService } from '../common/services/currency.service';
import { TransactionType } from '../wallet/entities/wallet-transaction.entity';

@Injectable()
export class SubscriptionCronService {
  private readonly logger = new Logger(SubscriptionCronService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UiSetting)
    private readonly uiSettingRepo: Repository<UiSetting>,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly currencyService: CurrencyService,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleSubscriptionRenewal() {
    this.logger.log('Running subscription renewal cron job...');

    const today = new Date();

    const users = await this.userRepository.find({
      where: {
        subscriptionTier: SubscriptionTier.PRO,
        autoRenew: true,
        subscriptionExpiry: LessThanOrEqual(today),
      },
    });

    this.logger.log(`Found ${users.length} users for renewal.`);

    let successCount = 0;
    let failureCount = 0;

    for (const user of users) {
      const result = await this.renewUserSubscription(user);
      if (result) successCount++;
      else failureCount++;
    }

    this.logger.log(
      `Processed ${users.length} renewals: ${successCount} succeeded, ${failureCount} failed.`,
    );
  }

  private async renewUserSubscription(user: User): Promise<boolean> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the user to prevent double processing
      const lockedUser = await queryRunner.manager.findOne(User, {
        where: { id: user.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedUser) {
        throw new Error('User not found during renewal');
      }

      // Double check expiry in case another process updated it
      if (
        lockedUser.subscriptionExpiry &&
        lockedUser.subscriptionExpiry > new Date()
      ) {
        this.logger.log(
          `Skipping renewal for user ${user.id}, already renewed.`,
        );
        await queryRunner.rollbackTransaction();
        return true; // Considered success as it's already done
      }

      const basePriceSetting = await this.uiSettingRepo.findOne({
        where: { key: 'vendor_subscription_base_price' },
      });
      const basePrice = basePriceSetting
        ? Number(basePriceSetting.value)
        : 9.99;

      const wallet = await this.walletService.getWallet(user.id);
      const currency = wallet.currency || 'KES';

      let amount = basePrice;
      if (currency !== 'USD') {
        amount = this.currencyService.convert(basePrice, 'USD', currency);
        // Round to 2 decimal places
        amount = Math.round(amount * 100) / 100;
      }

      // Attempt to deduct using the same transaction manager
      await this.walletService.debitWallet(
        user.id,
        amount,
        TransactionType.SUBSCRIPTION_RENEWAL,
        undefined, // Localized by client
        queryRunner.manager,
      );

      // Success
      const newExpiry = new Date(lockedUser.subscriptionExpiry || new Date());
      newExpiry.setDate(newExpiry.getDate() + 30);

      if (newExpiry < new Date()) {
        const today = new Date();
        today.setDate(today.getDate() + 30);
        lockedUser.subscriptionExpiry = today;
      } else {
        lockedUser.subscriptionExpiry = newExpiry;
      }

      await queryRunner.manager.save(lockedUser);
      await queryRunner.commitTransaction();

      this.logger.log(`Renewed subscription for user ${user.id}`);
      return true;
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to renew for user ${user.id}: ${error.message}`,
      );

      // Handle failure logic (outside the transaction to avoid locking issues if notification takes time)
      // Re-fetch user to check grace period without lock
      const freshUser = await this.userRepository.findOne({
        where: { id: user.id },
      });
      if (!freshUser) return false;

      const gracePeriodLimit = new Date(
        freshUser.subscriptionExpiry || new Date(),
      );
      gracePeriodLimit.setHours(gracePeriodLimit.getHours() + 24);

      if (new Date() > gracePeriodLimit) {
        // Downgrade
        freshUser.subscriptionTier = SubscriptionTier.FREE;

        // Update verified flag based on new tier and verification status
        if (freshUser.verificationStatus === VerificationStatus.APPROVED) {
          freshUser.verified = true;
        } else {
          freshUser.verified = false;
        }

        await this.userRepository.save(freshUser);

        await this.notificationsService.sendToUser({
          userId: user.id,
          title: 'Subscription Cancelled',
          body: 'Your subscription has been cancelled due to payment failure.',
          data: {
            type: 'SUBSCRIPTION_CANCELLED',
            url: 'suuq://vendor/wallet',
          },
        });
      } else {
        // Just notify about failure
        await this.notificationsService.sendToUser({
          userId: user.id,
          title: 'Subscription Renewal Failed',
          body: 'We could not renew your subscription. Please top up your wallet to avoid cancellation.',
          data: {
            type: 'SUBSCRIPTION_RENEWAL_FAILED',
            url: 'suuq://vendor/wallet',
          },
        });
      }
      return false;
    } finally {
      await queryRunner.release();
    }
  }
}
