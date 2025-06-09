import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity'; // <-- FIXED IMPORT
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Product } from '../products/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, Product])],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}