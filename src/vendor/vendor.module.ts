import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorService } from './vendor.service';
import { VendorController } from './vendor.controller';
import { VendorPublicController } from './vendor-public.controller';
import { VendorDashboardController } from './vendor-dashboard.controller';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Order } from '../orders/entities/order.entity';
import { ProductImage } from '../products/entities/product-image.entity'; // <-- 1. IMPORT ADDED

@Module({
  imports: [
    // ✨ 2. PRODUCTIMAGE ENTITY ADDED HERE
    TypeOrmModule.forFeature([User, Product, Order, ProductImage]),
  ],
  controllers: [
    VendorController,
    VendorPublicController,
    VendorDashboardController,
  ],
  providers: [VendorService],
})
export class VendorModule {}