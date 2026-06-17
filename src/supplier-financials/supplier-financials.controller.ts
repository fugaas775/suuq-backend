import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { extractActiveSupplierId } from '../suppliers/active-supplier.util';
import {
  SupplierFinancialsActor,
  SupplierFinancialsService,
} from './supplier-financials.service';

/** Lower bound — start of the given instant/day. */
function rangeStart(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Upper bound. A date-only value (YYYY-MM-DD) is inclusive of the whole day, so
 * extend it to end-of-day — mirrors BranchFinancialReportsController so the
 * counter slice windows identically to the branch reports.
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

/**
 * Supplier-scoped Financials + Reports. Every route resolves the acting supplier
 * server-side from the JWT user + `x-supplier-id` header (multi-supplier /
 * SUPER_ADMIN act-as) — no branchId is ever passed by the client. Read-only;
 * available to any member of the supplier (owner / manager / operator).
 */
@ApiTags('Supplier Financials')
@Controller('hub/v1/suppliers/me/financials')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupplierFinancialsController {
  constructor(private readonly service: SupplierFinancialsService) {}

  private actor(req: any): SupplierFinancialsActor {
    return {
      id: req.user?.id,
      roles: req.user?.roles,
      supplierId: extractActiveSupplierId(req),
    };
  }

  @Get('overview')
  @ApiOperation({ summary: 'Unified KPI strip — wholesale + counter' })
  overview(@Req() req, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getOverview(this.actor(req), {
      from: rangeStart(from),
      to: rangeEnd(to),
    });
  }

  @Get('statements/profit-loss')
  @ApiOperation({ summary: 'Counter outlet branch profit & loss' })
  profitLoss(
    @Req() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getProfitAndLoss(this.actor(req), {
      from: rangeStart(from),
      to: rangeEnd(to),
    });
  }

  @Get('statements/balance-sheet')
  @ApiOperation({ summary: 'Counter outlet branch balance sheet' })
  balanceSheet(@Req() req, @Query('asOfAt') asOfAt?: string) {
    return this.service.getBalanceSheet(this.actor(req), rangeEnd(asOfAt));
  }

  @Get('statements/trial-balance')
  @ApiOperation({ summary: 'Counter outlet branch trial balance' })
  trialBalance(@Req() req, @Query('asOfAt') asOfAt?: string) {
    return this.service.getTrialBalance(this.actor(req), rangeEnd(asOfAt));
  }

  @Get('sales-journal')
  @ApiOperation({ summary: 'Wholesale recognised orders as journal lines' })
  salesJournal(
    @Req() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getSalesJournal(
      this.actor(req),
      { from: rangeStart(from), to: rangeEnd(to) },
      Number(page) || 1,
      Number(limit) || 50,
    );
  }

  @Get('cash-receivables')
  @ApiOperation({ summary: 'Wholesale receivables aging + counter cash slice' })
  cashReceivables(@Req() req, @Query('asOfAt') asOfAt?: string) {
    return this.service.getCashReceivables(this.actor(req), rangeEnd(asOfAt));
  }

  @Get('reports')
  @ApiOperation({
    summary: 'Wholesale analytics for the supplier Reports page',
  })
  reports(@Req() req, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getReports(this.actor(req), {
      from: rangeStart(from),
      to: rangeEnd(to),
    });
  }
}
