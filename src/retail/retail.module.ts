import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Branch } from '../branches/entities/branch.entity';
import { Category } from '../categories/entities/category.entity';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import { BranchTransfer } from '../branches/entities/branch-transfer.entity';
import { StockMovement } from '../branches/entities/stock-movement.entity';
import { RolesGuard } from '../auth/roles.guard';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { EbirrModule } from '../ebirr/ebirr.module';
import { PosSyncJob } from '../pos-sync/entities/pos-sync-job.entity';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { PurchaseOrderReceiptEvent } from '../purchase-orders/entities/purchase-order-receipt-event.entity';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { RedisModule } from '../redis/redis.module';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { PayoutLog } from '../wallet/entities/payout-log.entity';
import { RetailAdminController } from './retail.admin.controller';
import { HrAttendanceLog } from './entities/hr-attendance-log.entity';
import { RetailCommandCenterReportingService } from './retail-command-center-reporting.service';
import { RetailAttendanceService } from './retail-attendance.service';
import { RetailEntitlementsService } from './retail-entitlements.service';
import { RetailOpsController } from './retail-ops.controller';
import { RetailOpsService } from './retail-ops.service';
import { RetailTenant } from './entities/retail-tenant.entity';
import { TenantModuleEntitlement } from './entities/tenant-module-entitlement.entity';
import { TenantSubscription } from './entities/tenant-subscription.entity';
import { RetailModulesGuard } from './retail-modules.guard';
import { EquityPartner } from './entities/equity-partner.entity';
import { EquitySplitAssignment } from './entities/equity-split-assignment.entity';
import { EquityPayout } from './entities/equity-payout.entity';
import { EquityPartnerBnplActivation } from './entities/equity-partner-bnpl-activation.entity';
import { EquityPartnerService } from './equity-partner.service';
import { EquityPartnerBnplService } from './equity-partner-bnpl.service';
import { SellerEquityController } from './seller-equity.controller';
import { SellerEquityBnplController } from './seller-equity-bnpl.controller';
import { AdminEquityPartnersController } from './admin-equity-partners.controller';

@Module({
  imports: [
    forwardRef(() => PurchaseOrdersModule),
    AuditModule,
    RedisModule,
    EbirrModule,
    TypeOrmModule.forFeature([
      RetailTenant,
      Category,
      TenantSubscription,
      TenantModuleEntitlement,
      Branch,
      BranchStaffAssignment,
      HrAttendanceLog,
      BranchInventory,
      BranchTransfer,
      StockMovement,
      PurchaseOrder,
      PurchaseOrderReceiptEvent,
      PosSyncJob,
      Order,
      Product,
      User,
      PayoutLog,
      EquityPartner,
      EquitySplitAssignment,
      EquityPayout,
      EquityPartnerBnplActivation,
    ]),
  ],
  controllers: [
    RetailAdminController,
    RetailOpsController,
    SellerEquityController,
    SellerEquityBnplController,
    AdminEquityPartnersController,
  ],
  providers: [
    RetailEntitlementsService,
    RetailModulesGuard,
    RetailAttendanceService,
    RetailOpsService,
    RetailCommandCenterReportingService,
    EquityPartnerService,
    EquityPartnerBnplService,
    RolesGuard,
  ],
  exports: [
    RetailEntitlementsService,
    RetailModulesGuard,
    EquityPartnerService,
    EquityPartnerBnplService,
  ],
})
export class RetailModule {}
