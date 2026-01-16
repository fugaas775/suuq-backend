import { forwardRef, Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { WalletModule } from '../wallet/wallet.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity'; // <-- FIXED IMPORT
import { Wallet } from '../wallet/entities/wallet.entity';
import { SubscriptionRequest } from './entities/subscription-request.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { CurrencyModule } from '../common/services/currency.module';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { SubscriptionCronService } from './subscription-cron.service';
import { ChurnRecoveryService } from './churn-recovery.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, SubscriptionRequest, UiSetting, Wallet]),
    forwardRef(() => ProductsModule),
    forwardRef(() => WalletModule),
    CurrencyModule,
    forwardRef(() => NotificationsModule),
  ],
  providers: [UsersService, SubscriptionCronService, ChurnRecoveryService],
  controllers: [UsersController, SubscriptionsController],
  exports: [UsersService, ChurnRecoveryService],
})
export class UsersModule {}
