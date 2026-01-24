
import { Module } from '@nestjs/common';
import { EbirrCallbackController } from './ebirr-callback.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  controllers: [EbirrCallbackController],
})
export class CallbacksModule {}
