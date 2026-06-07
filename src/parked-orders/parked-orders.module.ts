import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParkedOrder } from './entities/parked-order.entity';
import { Product } from '../products/entities/product.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ParkedOrdersService } from './parked-orders.service';
import {
  ConsumerParkedOrdersController,
  PosParkedOrdersController,
  VendorParkedOrdersController,
} from './parked-orders.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ParkedOrder, Product, VendorStore]),
    NotificationsModule,
  ],
  controllers: [
    ConsumerParkedOrdersController,
    VendorParkedOrdersController,
    PosParkedOrdersController,
  ],
  providers: [ParkedOrdersService],
  exports: [ParkedOrdersService],
})
export class ParkedOrdersModule {}
