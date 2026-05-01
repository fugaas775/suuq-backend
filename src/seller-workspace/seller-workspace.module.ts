import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchStaffModule } from '../branch-staff/branch-staff.module';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { RetailTenant } from '../retail/entities/retail-tenant.entity';
import { TenantModuleEntitlement } from '../retail/entities/tenant-module-entitlement.entity';
import { TenantSubscription } from '../retail/entities/tenant-subscription.entity';
import { User } from '../users/entities/user.entity';
import { VendorModule } from '../vendor/vendor.module';
import { PosCheckout } from '../pos-sync/entities/pos-checkout.entity';
import { PosRegisterSession } from '../pos-sync/entities/pos-register-session.entity';
import { PosSyncJob } from '../pos-sync/entities/pos-sync-job.entity';
import { SellerWorkspace } from './entities/seller-workspace.entity';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { SellerWorkspaceController } from './seller-workspace.controller';
import { SellerWorkspaceService } from './seller-workspace.service';
import { RetailModule } from '../retail/retail.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Order,
      PurchaseOrder,
      PosCheckout,
      PosSyncJob,
      PosRegisterSession,
      SellerWorkspace,
      RetailTenant,
      TenantModuleEntitlement,
      TenantSubscription,
      Product,
      Branch,
      BranchStaffAssignment,
    ]),
    VendorModule,
    BranchStaffModule,
    RetailModule,
    EmailModule,
  ],
  controllers: [SellerWorkspaceController],
  providers: [SellerWorkspaceService],
  exports: [SellerWorkspaceService],
})
export class SellerWorkspaceModule {}
