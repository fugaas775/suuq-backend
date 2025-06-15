import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorDashboardService } from './vendor-dashboard.service';
import { VendorDashboardController } from './vendor-dashboard.controller';
import { Product } from '../products/entities/product.entity';
import { Order } from '../orders/entities/order.entity';
import { Withdrawal } from '../withdrawals/entities/withdrawal.entity';
import { Vendor } from '../vendor/entities/vendor.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Order, Withdrawal, Vendor])],
  providers: [VendorDashboardService],
  controllers: [VendorDashboardController],
})
export class VendorDashboardModule {}