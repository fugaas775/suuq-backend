import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, OrderItem } from './entities/order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CartModule } from '../cart/cart.module';
import { ProductsModule } from '../products/products.module';
import { TelebirrModule } from '../telebirr/telebirr.module';
import { MpesaModule } from '../mpesa/mpesa.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { AuditModule } from '../audit/audit.module';
import { CurrencyModule } from '../common/services/currency.module';
import { EmailModule } from '../email/email.module';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { EbirrModule } from '../ebirr/ebirr.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, UiSetting]),
    CartModule,
    ProductsModule,
    TelebirrModule,
    EbirrModule,
    UsersModule,
    MpesaModule,
    NotificationsModule,
    MediaModule,
    AuditModule,
    CurrencyModule,
    EmailModule,
    WalletModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [TypeOrmModule, OrdersService],
})
export class OrdersModule {}
