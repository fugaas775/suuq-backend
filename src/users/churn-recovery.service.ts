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
    this.logger.log(
      'Payment model is commission based. Skipping churn recovery.',
    );
    return;
  }

  async checkAndNotifyUser(
    user: User,
    options?: { force?: boolean },
  ): Promise<boolean> {
    // Disabled since subscription logic is now commission-based.
    return false;
  }

  async remindRenewal(
    userId: number,
  ): Promise<{ sent: boolean; reason?: string }> {
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
