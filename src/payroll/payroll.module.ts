import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { RetailModule } from '../retail/retail.module';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { BranchEmployee } from './entities/branch-employee.entity';
import { PayrollRun } from './entities/payroll-run.entity';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

/**
 * Who the branch employs, and what a month of them costs.
 *
 * Format-agnostic on purpose. A school's teachers, a hotel's housekeepers and a
 * restaurant's kitchen are the same record with different job titles, and labour
 * is the largest line in most of their P&Ls — the first school to arrive with a
 * real roster was spending 65% of its fee income on wages that the books could
 * not see at all.
 *
 * Imports BillingModule rather than writing to `branch_expenses` directly, so a
 * payroll run posts through the same path as rent and utilities and inherits its
 * ledger entry, its P&L classification and its reversal-on-delete.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([BranchEmployee, PayrollRun]),
    BillingModule,
    RetailModule,
  ],
  controllers: [PayrollController],
  providers: [PayrollService, PosBranchAccessGuard, RolesGuard],
  exports: [PayrollService],
})
export class PayrollModule {}
