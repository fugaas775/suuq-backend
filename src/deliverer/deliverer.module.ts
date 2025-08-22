import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DelivererService } from './deliverer.service';
import { DelivererController } from './deliverer.controller';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Product])],
  controllers: [DelivererController],
  providers: [DelivererService],
  exports: [DelivererService],
})
export class DelivererModule {}
