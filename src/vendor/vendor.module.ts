import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorService } from './vendor.service';
import { VendorController } from './vendor.controller';
import { VendorPublicController } from './vendor-public.controller';
import { VendorDashboardController } from './vendor-dashboard.controller';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Order, OrderItem } from '../orders/entities/order.entity';
import { ProductImage } from '../products/entities/product-image.entity'; // <-- 1. IMPORT ADDED
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [
    // ✨ 2. PRODUCTIMAGE ENTITY ADDED HERE
    TypeOrmModule.forFeature([User, Product, Order, OrderItem, ProductImage]),
    UsersModule,
    forwardRef(() => ProductsModule),
    MediaModule,
    NotificationsModule,
  ],
  controllers: [
    VendorController,
    VendorPublicController,
    VendorDashboardController,
  ],
  providers: [VendorService],
  exports: [VendorService],
})
export class VendorModule {}
