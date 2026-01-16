import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { User, SubscriptionTier } from './entities/user.entity';
import { Repository } from 'typeorm';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { CurrencyService } from '../common/services/currency.service';

@Injectable()
export class ChurnRecoveryService {
  private readonly logger = new Logger(ChurnRecoveryService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UiSetting)
    private readonly uiSettingRepo: Repository<UiSetting>,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly currencyService: CurrencyService,
  ) {}

  @Cron('0 10 * * *') // Every day at 10:00 AM
  async handleChurnRecovery() {
    // Prevent duplicate execution in PM2 cluster mode
    if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') {
      return;
    }

    this.logger.log('Running churn recovery cron job on instance 0...');

    const users = await this.userRepository.find({
      where: {
        subscriptionTier: SubscriptionTier.PRO,
        autoRenew: true,
      },
    });

    this.logger.log(`Checking ${users.length} pro users for churn risk.`);

    for (const user of users) {
      await this.checkAndNotifyUser(user);
    }
  }

  async checkAndNotifyUser(user: User, options?: { force?: boolean }): Promise<boolean> {
    try {
      const basePriceSetting = await this.uiSettingRepo.findOne({
        where: { key: 'vendor_subscription_base_price' },
      });
      const basePrice = basePriceSetting
        ? Number(basePriceSetting.value)
        : 9.99;

      const wallet = await this.walletService.getWallet(user.id);
      const currency = wallet.currency || 'KES';

      let requiredAmount = basePrice;
      if (currency !== 'USD') {
        requiredAmount = this.currencyService.convert(
          basePrice,
          'USD',
          currency,
        );
        // Round to 2 decimal places to match subscription logic
        requiredAmount = Math.round(requiredAmount * 100) / 100;
      }

      // Calculate days until renewal
      let daysUntilRenewal = 0;
      if (user.subscriptionExpiry) {
        const diff = user.subscriptionExpiry.getTime() - Date.now();
        daysUntilRenewal = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }

      // Logic Update: Only notify if renewal is within 7 days
      // Unless it's a forced check (e.g. manual admin trigger)
      if (!options?.force && daysUntilRenewal > 7) {
        this.logger.debug(
          `Skipping churn check for user ${user.id}: Renewal in ${daysUntilRenewal} days`,
        );
        return false;
      }

      const isRisk = wallet.balance < requiredAmount;

      if (isRisk || options?.force) {
        // Prevent spam: Don't send if sent within last 20 hours (unless forced)
        if (
          !options?.force &&
          user.lastRenewalReminderAt &&
          Date.now() - user.lastRenewalReminderAt.getTime() < 20 * 60 * 60 * 1000
        ) {
          this.logger.debug(
            `Skipping churn notification for ${user.id} - already sent recently.`,
          );
          return false;
        }

        const expiryDateStr = user.subscriptionExpiry
          ? user.subscriptionExpiry.toLocaleDateString()
          : 'soon';

        const title = isRisk
          ? '⚠️ Action Required: Pro Renewal at Risk'
          : '📅 Pro Subscription Renewal';
        const body = isRisk
          ? `Your Pro subscription renews on ${expiryDateStr}. Your wallet balance is too low. Top up now to keep your Verified Badge!`
          : `Your Pro subscription will renew on ${expiryDateStr}. Please ensure your wallet has sufficient funds.`;

        await this.notificationsService.sendToUser({
          userId: user.id,
          title,
          body,
          data: {
            url: 'suuq://vendor/wallet',
            type: 'CHURN_RISK',
          },
        });

        user.lastRenewalReminderAt = new Date();
        user.renewalReminderCount = (user.renewalReminderCount || 0) + 1;
        await this.userRepository.save(user);

        this.logger.log(`Sent churn risk notification to user ${user.id}`);
        return true;
      }
      return false;
    } catch (error: any) {
      this.logger.error(
        `Failed to check churn risk for user ${user.id}: ${error.message}`,
      );
      return false;
    }
  }

  async remindRenewal(userId: number): Promise<{ sent: boolean; reason?: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Check logic: Only send if user is actually at risk (insufficient balance)
    // We do not force it, to avoid spamming users who have already topped up.
    const sent = await this.checkAndNotifyUser(user);

    if (!sent) {
        return { sent: false, reason: 'User has sufficient balance' };
    }
    return { sent: true };
  }
}
