import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DelivererService } from './deliverer.service';
import { DelivererController } from './deliverer.controller';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { WalletModule } from '../wallet/wallet.module';
import { SettingsModule } from '../settings/settings.module';
import { EmailModule } from '../email/email.module';
import { CurrencyModule } from '../common/services/currency.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Product]),
    WalletModule,
    SettingsModule,
    EmailModule,
    CurrencyModule,
    NotificationsModule,
    RealtimeModule,
  ],
  controllers: [DelivererController],
  providers: [DelivererService],
  exports: [DelivererService],
})
export class DelivererModule {}
