import { Module } from '@nestjs/common';
import { EbirrCallbackController } from './ebirr-callback.controller';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { EbirrModule } from '../ebirr/ebirr.module';

@Module({
  imports: [OrdersModule, ProductsModule, EbirrModule],
  controllers: [EbirrCallbackController],
})
export class CallbacksModule {}
