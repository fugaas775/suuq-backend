import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { BranchesModule } from '../branches/branches.module';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import { Branch } from '../branches/entities/branch.entity';
import { PartnerCredentialsModule } from '../partner-credentials/partner-credentials.module';
import { PartnerCredential } from '../partner-credentials/entities/partner-credential.entity';
import { ProductAliasesModule } from '../product-aliases/product-aliases.module';
import { ProductAlias } from '../product-aliases/entities/product-alias.entity';
import { Product } from '../products/entities/product.entity';
import { RetailModule } from '../retail/retail.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PurchaseOrderItem } from '../purchase-orders/entities/purchase-order.entity';
import { ProductCostService } from '../purchase-orders/product-cost.service';
import { PosCatalogController } from './pos-catalog.controller';
import { PosCatalogService } from './pos-catalog.service';
import { PosPartnerCheckoutController } from './pos-partner-checkout.controller';
import { PosPartnerRegisterController } from './pos-partner-register.controller';
import { PosPartnerSyncController } from './pos-partner-sync.controller';
import { PosCheckoutController } from './pos-checkout.controller';
import { PosCheckoutService } from './pos-checkout.service';
import { PosRegisterController } from './pos-register.controller';
import { PosRegisterService } from './pos-register.service';
import { PosSyncController } from './pos-sync.controller';
import { PosSyncRequestAuthGuard } from './pos-sync-request-auth.guard';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { PosCheckout } from './entities/pos-checkout.entity';
import { PosRegisterSession } from './entities/pos-register-session.entity';
import { PosSuspendedCart } from './entities/pos-suspended-cart.entity';
import { PosSyncService } from './pos-sync.service';
import { PosSyncJob } from './entities/pos-sync-job.entity';

@Module({
  imports: [
    EmailModule,
    BranchesModule,
    PartnerCredentialsModule,
    ProductAliasesModule,
    RetailModule,
    AccountingModule,
    TypeOrmModule.forFeature([
      PosSyncJob,
      PosCheckout,
      PosRegisterSession,
      PosSuspendedCart,
      Branch,
      BranchInventory,
      PartnerCredential,
      Product,
      ProductAlias,
      PurchaseOrderItem,
    ]),
  ],
  controllers: [
    PosSyncController,
    PosPartnerSyncController,
    PosCheckoutController,
    PosPartnerCheckoutController,
    PosCatalogController,
    PosRegisterController,
    PosPartnerRegisterController,
  ],
  providers: [
    PosSyncService,
    PosCheckoutService,
    PosCatalogService,
    PosRegisterService,
    PosSyncRequestAuthGuard,
    PosBranchAccessGuard,
    ProductCostService,
  ],
  exports: [
    PosSyncService,
    PosCheckoutService,
    PosCatalogService,
    PosRegisterService,
  ],
})
export class PosSyncModule {}
