import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { Order } from '../orders/entities/order.entity';
import { OrdersService } from '../orders/orders.service';
import { MpesaModule } from '../mpesa/mpesa.module';
import { CartService } from '../cart/cart.service';
import { TelebirrModule } from '../telebirr/telebirr.module';
import { CartModule } from '../cart/cart.module';
import { NotificationsModule } from '../notifications/notifications.module'; // <-- IMPORT THIS

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    MpesaModule,
    TelebirrModule,
    CartModule,
    NotificationsModule, // <-- ADD THIS LINE
  ],
  controllers: [PaymentsController],
  providers: [OrdersService, CartService],
})
export class PaymentsModule {}
