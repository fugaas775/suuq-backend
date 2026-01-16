import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository, DataSource } from 'typeorm';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { CurrencyService } from '../common/services/currency.service';

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
    this.logger.log('Subscription renewal is deprecated. Skipping process.');
    return; 
  }
}
