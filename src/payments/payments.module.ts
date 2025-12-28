import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { Order } from '../orders/entities/order.entity';
import { MpesaModule } from '../mpesa/mpesa.module';
import { TelebirrModule } from '../telebirr/telebirr.module';
import { CartModule } from '../cart/cart.module';
import { NotificationsModule } from '../notifications/notifications.module'; // <-- IMPORT THIS
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    MpesaModule,
    TelebirrModule,
    CartModule,
    NotificationsModule, // <-- ADD THIS LINE
    OrdersModule,
  ],
  controllers: [PaymentsController],
  providers: [],
})
export class PaymentsModule {}
