import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorService } from './vendor.service';
import { VendorController } from './vendor.controller';
import { VendorPublicController } from './vendor-public.controller';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Order, OrderItem } from '../orders/entities/order.entity';
import { Dispute } from '../orders/entities/dispute.entity';
import { ProductImage } from '../products/entities/product-image.entity'; // <-- 1. IMPORT ADDED
import { ProductImpression } from '../products/entities/product-impression.entity';
import { Tag } from '../tags/tag.entity';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { ProductsModule } from '../products/products.module';
import { SearchKeyword } from '../products/entities/search-keyword.entity';
import { VendorAnalyticsController } from './vendor-analytics.controller';
import { CurrencyModule } from '../common/services/currency.module';
import { ShippingModule } from '../shipping/shipping.module';
import { UserReport } from '../moderation/entities/user-report.entity';
import { SettingsModule } from '../settings/settings.module';
import { VendorStaff } from './entities/vendor-staff.entity';
import { VendorStaffService } from './vendor-staff.service';
import { VendorStaffController } from './vendor-staff.controller';
import { VendorMeController } from './vendor-me.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    ShippingModule,
    SettingsModule,
    EmailModule,
    // ✨ 2. PRODUCTIMAGE ENTITY ADDED HERE
    TypeOrmModule.forFeature([
      User,
      Product,
      Order,
      OrderItem,
      Dispute,
      ProductImage,
      ProductImpression,
      Tag,
      SearchKeyword,
      UserReport,
      VendorStaff,
    ]),
    forwardRef(() => UsersModule),
    forwardRef(() => ProductsModule),
    MediaModule,
    NotificationsModule,
    CurrencyModule,
  ],
  controllers: [
    VendorController,
    VendorPublicController,
    VendorAnalyticsController,
    VendorStaffController,
    VendorMeController,
  ],
  providers: [VendorService, VendorStaffService],
  exports: [VendorService, VendorStaffService],
})
export class VendorModule {}
