import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { RolesGuard } from '../auth/roles.guard';

// 1. Import the modules that provide the services you need
import { UsersModule } from '../users/users.module';
import { OrdersModule } from '../orders/orders.module';
import { DelivererModule } from '../deliverer/deliverer.module';
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
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { AdminEbirrAuditController } from './ebirr-audit.controller';
import { CreditModule } from '../credit/credit.module';
import { AdminCreditController } from './credit.admin.controller';
import { AdminAdsController } from './ads.admin.controller';
import { TelebirrTransaction } from '../payments/entities/telebirr-transaction.entity';
import { EbirrModule } from '../ebirr/ebirr.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { PartnerCredentialsModule } from '../partner-credentials/partner-credentials.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { AdminB2bController } from './b2b.admin.controller';
import { AdminB2bService } from './b2b.admin.service';
import { BranchTransfer } from '../branches/entities/branch-transfer.entity';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import { StockMovement } from '../branches/entities/stock-movement.entity';
import { PosSyncJob } from '../pos-sync/entities/pos-sync-job.entity';
import { PurchaseOrderReceiptEvent } from '../purchase-orders/entities/purchase-order-receipt-event.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';

@Module({
  // 2. Add UsersModule and OrdersModule here
  imports: [
    BullModule.registerQueue({ name: 'emails' }, { name: 'notifications' }),
    UsersModule,
    OrdersModule,
    DelivererModule,
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
    CreditModule,
    EbirrModule,
    SuppliersModule,
    PartnerCredentialsModule,
    PurchaseOrdersModule,
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
      BranchTransfer,
      BranchInventory,
      EbirrTransaction,
      PosSyncJob,
      PurchaseOrder,
      PurchaseOrderReceiptEvent,
      StockMovement,
      TelebirrTransaction,
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
    AdminEbirrAuditController,
    AdminCreditController,
    AdminAdsController,
    AdminB2bController,
  ],
  // 3. Remove the services from providers. They are now correctly provided by the imported modules.
  providers: [
    RolesGuard,
    GeoResolverService,
    AdminB2bService,
    AdminOutreachService,
    FeatureFlagGuard,
  ],
})
export class AdminModule {}
