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

@Module({
  imports: [
    forwardRef(() => PurchaseOrdersModule),
    AuditModule,
    RedisModule,
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
    ]),
  ],
  controllers: [RetailAdminController, RetailOpsController],
  providers: [
    RetailEntitlementsService,
    RetailModulesGuard,
    RetailAttendanceService,
    RetailOpsService,
    RetailCommandCenterReportingService,
    RolesGuard,
  ],
  exports: [RetailEntitlementsService, RetailModulesGuard],
})
export class RetailModule {}
