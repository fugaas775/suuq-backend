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
    this.logger.log('Running churn recovery cron job...');

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

  async checkAndNotifyUser(user: User) {
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

      if (wallet.balance < requiredAmount) {
        await this.notificationsService.sendToUser({
          userId: user.id,
          title: '⚠️ Action Required: Pro Renewal at Risk',
          body: 'Your wallet balance is too low for your Pro renewal. Top up now to keep your Verified Badge and Priority Listing!',
          data: {
            url: 'suuq://vendor/wallet',
            type: 'CHURN_RISK',
          },
        });

        user.lastRenewalReminderAt = new Date();
        user.renewalReminderCount = (user.renewalReminderCount || 0) + 1;
        await this.userRepository.save(user);

        this.logger.log(`Sent churn risk notification to user ${user.id}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to check churn risk for user ${user.id}: ${error.message}`,
      );
    }
  }

  async remindRenewal(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    await this.checkAndNotifyUser(user);
  }
}
