import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { Order } from '../orders/entities/order.entity';
import { TelebirrTransaction } from './entities/telebirr-transaction.entity';
import { MpesaModule } from '../mpesa/mpesa.module';
import { TelebirrModule } from '../telebirr/telebirr.module';
import { EbirrModule } from '../ebirr/ebirr.module';
import { CartModule } from '../cart/cart.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, TelebirrTransaction]),
    MpesaModule,
    TelebirrModule,
    EbirrModule,
    CartModule,
    NotificationsModule,
    OrdersModule,
    ProductsModule,
  ],
  controllers: [PaymentsController],
  providers: [],
})
export class PaymentsModule {}
