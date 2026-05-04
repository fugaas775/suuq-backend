import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import { TenantSubscription } from '../retail/entities/tenant-subscription.entity';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { PosCheckout } from '../pos-sync/entities/pos-checkout.entity';
import { PosRegisterSession } from '../pos-sync/entities/pos-register-session.entity';
import {
  PurchaseOrder,
  PurchaseOrderItem,
} from '../purchase-orders/entities/purchase-order.entity';
import { BranchStaffModule } from '../branch-staff/branch-staff.module';
import { BranchAccruedLiability } from './entities/branch-accrued-liability.entity';
import { BranchDepreciationEntry } from './entities/branch-depreciation-entry.entity';
import { BranchExpense } from './entities/branch-expense.entity';
import { BranchFixedAsset } from './entities/branch-fixed-asset.entity';
import { BranchLongTermDebt } from './entities/branch-long-term-debt.entity';
import { BranchBillingService } from './branch-billing.service';
import { BranchFinancialReportsService } from './branch-financial-reports.service';
import { OwnerBillingController } from './owner-billing.controller';
import { BranchFinancialReportsController } from './branch-financial-reports.controller';

@Module({
  imports: [
    BranchStaffModule,
    TypeOrmModule.forFeature([
      Branch,
      BranchInventory,
      BranchFixedAsset,
      BranchDepreciationEntry,
      BranchAccruedLiability,
      BranchLongTermDebt,
      BranchExpense,
      TenantSubscription,
      EbirrTransaction,
      PosCheckout,
      PosRegisterSession,
      PurchaseOrder,
      PurchaseOrderItem,
    ]),
  ],
  controllers: [OwnerBillingController, BranchFinancialReportsController],
  providers: [BranchBillingService, BranchFinancialReportsService],
  exports: [BranchBillingService, BranchFinancialReportsService],
})
export class BillingModule {}
