import { Module } from '@nestjs/common';
import { EbirrCallbackController } from './ebirr-callback.controller';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { EbirrModule } from '../ebirr/ebirr.module';
import { StarpayModule } from '../starpay/starpay.module';
import { StarpayCallbackController } from './starpay-callback.controller';

@Module({
  imports: [OrdersModule, ProductsModule, EbirrModule, StarpayModule],
  controllers: [EbirrCallbackController, StarpayCallbackController],
})
export class CallbacksModule {}
