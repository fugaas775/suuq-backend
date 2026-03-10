import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/entities/order.entity';
import { OrdersModule } from '../orders/orders.module';
import { PaymentLog } from '../payments/entities/payment-log.entity';
import { StarpayController } from './starpay.controller';
import { StarpayService } from './starpay.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, PaymentLog]), OrdersModule],
  controllers: [StarpayController],
  providers: [StarpayService],
  exports: [StarpayService],
})
export class StarpayModule {}
