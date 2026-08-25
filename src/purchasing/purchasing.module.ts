import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { BranchesModule } from '../branches/branches.module';
import { RetailModule } from '../retail/retail.module';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PosCashMovement } from './entities/pos-cash-movement.entity';
import { PurchaseRun } from './entities/purchase-run.entity';
import { PurchaseRunLine } from './entities/purchase-run-line.entity';
import { User } from '../users/entities/user.entity';
import { BranchExpense } from '../billing/entities/branch-expense.entity';
import { PurchasingController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';

/**
 * Buying, for a branch that buys the way most branches here actually do:
 * with cash, at a market, from somebody who has no account on this platform.
 *
 * Format-agnostic on purpose, like payroll. A QSR needed it first — it is the
 * format where the cost of goods is the business — but a hotel buys its linen
 * the same way and a school buys its exercise books the same way, and none of
 * them has a purchase order for it.
 *
 * Imports BillingModule rather than writing to `branch_expenses` directly, so an
 * approved run posts through the same path as rent and payroll and inherits its
 * ledger entry, its P&L classification and its reversal-on-delete. Imports
 * BranchesModule for the inventory ledger, so a line that names a product moves
 * stock through the one service that owns on-hand quantities.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseRun,
      PurchaseRunLine,
      PosCashMovement,
      // Read-only, and only to put a human name on a document: a POS token
      // carries a synthetic @sys.internal address and no displayName.
      User,
      // Read-only. Answers "did a previous attempt already post this run's
      // expense?" so a resumed approval adopts it instead of posting twice.
      BranchExpense,
    ]),
    BillingModule,
    BranchesModule,
    RetailModule,
  ],
  controllers: [PurchasingController],
  providers: [PurchasingService, PosBranchAccessGuard, RolesGuard],
  exports: [PurchasingService],
})
export class PurchasingModule {}
