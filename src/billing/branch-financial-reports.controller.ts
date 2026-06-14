import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { BranchBillingService } from './branch-billing.service';
import { BranchFinancialReportsService } from './branch-financial-reports.service';

/** Lower bound — start of the given instant/day. */
function rangeStart(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Upper bound. A date-only value (YYYY-MM-DD) is inclusive of the whole day, so
 * extend it to end-of-day — otherwise `to`/`asOfAt = today` silently excludes
 * every transaction that occurred during today (they fall after midnight UTC).
 */
function rangeEnd(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d;
}

@ApiTags('Owner Reports')
@Controller('seller/v1/reports/branches')
@UseGuards(JwtAuthGuard)
export class BranchFinancialReportsController {
  constructor(
    private readonly billing: BranchBillingService,
    private readonly reports: BranchFinancialReportsService,
  ) {}

  @Get(':branchId/profit-loss')
  async profitLoss(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const userId = (req.user as any).id;
    await this.billing.assertBranchOwnedBy(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.reports.getProfitAndLoss(branchId, {
      from: rangeStart(from),
      to: rangeEnd(to),
    });
  }

  @Get(':branchId/balance-sheet')
  async balanceSheet(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('asOfAt') asOfAt?: string,
  ) {
    const userId = (req.user as any).id;
    await this.billing.assertBranchOwnedBy(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.reports.getBalanceSheet(branchId, {
      asOfAt: rangeEnd(asOfAt),
    });
  }

  @Get(':branchId/trial-balance')
  async trialBalance(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('asOfAt') asOfAt?: string,
  ) {
    const userId = (req.user as any).id;
    await this.billing.assertBranchOwnedBy(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.reports.getTrialBalance(branchId, {
      asOfAt: rangeEnd(asOfAt),
    });
  }
}
