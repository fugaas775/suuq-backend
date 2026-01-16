import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { RolesGuard } from '../auth/roles.guard';

// 1. Import the modules that provide the services you need
import { UsersModule } from '../users/users.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminCurationController } from './curation.controller';
import { ProductImpression } from '../products/entities/product-impression.entity';
import { Product } from '../products/entities/product.entity';
import { Tag } from '../tags/tag.entity';
import { ProductsModule } from '../products/products.module';
import { VendorModule } from '../vendor/vendor.module';
import { AdminVendorsController } from './vendors.admin.controller';
import { AuditModule } from '../audit/audit.module';
import { SearchKeyword } from '../products/entities/search-keyword.entity';
import { AdminAnalyticsController } from './analytics.controller';
import { RolesModule } from '../roles/roles.module';
import { AdminRolesController } from './roles.admin.controller';
import { GeoResolverService } from '../common/services/geo-resolver.service';
import { AdminProductsController } from './products.admin.controller';
import { SupplyOutreachTask } from './entities/supply-outreach-task.entity';
import { AdminOutreachController } from './outreach.admin.controller';
import { AdminOutreachService } from './outreach.admin.service';
import { ProductRequest } from '../product-requests/entities/product-request.entity';
import { User } from '../users/entities/user.entity';
import { FeatureFlagsModule } from '../common/feature-flags/feature-flags.module';
import { FeatureFlagGuard } from '../common/feature-flags/feature-flag.guard';
import { ProductRequestForward } from '../product-requests/entities/product-request-forward.entity';
import { AdminProductRequestsController } from './product-requests.admin.controller';
import { AdminSearchLogController } from './search-log.admin.controller';
import { SearchModule } from '../search/search.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SearchLog } from '../search/entities/search-log.entity';
import { AdminUsersController } from './users.admin.controller';
import { AdminAuditController } from './audit.admin.controller';
import { CurrencyModule } from '../common/services/currency.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminWalletController } from './admin-wallet.controller';
import { MetricsModule } from '../metrics/metrics.module';
import { AdminNotificationsController } from './notifications.admin.controller';
import { AdminSystemController } from './admin-system.controller';
import { EmailModule } from '../email/email.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  // 2. Add UsersModule and OrdersModule here
  imports: [
    BullModule.registerQueue({ name: 'emails' }, { name: 'notifications' }),
    UsersModule,
    OrdersModule,
    ProductsModule,
    VendorModule,
    AuditModule,
    RolesModule,
    FeatureFlagsModule,
    MetricsModule,
    WalletModule,
    SearchModule,
    NotificationsModule,
    CurrencyModule,
    EmailModule,
    TypeOrmModule.forFeature([
      Product,
      ProductImpression,
      Tag,
      SearchKeyword,
      SearchLog,
      SupplyOutreachTask,
      ProductRequest,
      ProductRequestForward,
      User,
    ]),
  ],
  controllers: [
    AdminController,
    AdminCurationController,
    AdminVendorsController,
    AdminAnalyticsController,
    AdminRolesController,
    AdminProductsController,
    AdminOutreachController,
    AdminProductRequestsController,
    AdminSearchLogController,
    AdminUsersController,
    AdminAuditController,
    AdminWalletController,
    AdminNotificationsController,
    AdminSystemController,
  ],
  // 3. Remove the services from providers. They are now correctly provided by the imported modules.
  providers: [
    RolesGuard,
    GeoResolverService,
    AdminOutreachService,
    FeatureFlagGuard,
  ],
})
export class AdminModule {}
