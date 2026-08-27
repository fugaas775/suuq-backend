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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Which clock a date-only bound is read against.
 *
 * `2026-08-26` names a day, and a day only means something in a timezone. These
 * endpoints resolved it in UTC, while every window in the POS frontend is EAT
 * (UTC+3) — so a branch asking for "today's" profit got 03:00 today to 02:59
 * tomorrow in its own wall clock. Sales rung between midnight and 3 a.m. landed
 * on the wrong day, and the daily P&L never quite agreed with the till's own
 * Z-report for the same date.
 *
 * The caller now says which offset it means, in minutes east of UTC, and the
 * bounds are built in that clock. Omitted, it stays UTC — so an existing caller
 * that never passed it reads exactly what it read before.
 */
function parseTzOffsetMinutes(value?: string): number {
  const minutes = Number(value);
  // Real zones run to ±14 h. Anything else is a typo or a probe, and silently
  // shifting a branch's books by it would be worse than ignoring it.
  if (!Number.isFinite(minutes) || Math.abs(minutes) > 14 * 60) return 0;
  return Math.trunc(minutes);
}

/** Lower bound — the first instant of the named day, in the caller's clock. */
function rangeStart(value?: string, tzOffsetMinutes = 0): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) {
    // 'YYYY-MM-DDT00:00:00Z' minus the offset = local midnight as an instant.
    const utcMidnight = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(utcMidnight.getTime())) return null;
    return new Date(utcMidnight.getTime() - tzOffsetMinutes * 60_000);
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Upper bound. A date-only value (YYYY-MM-DD) is inclusive of the whole day, so
 * extend it to end-of-day — otherwise `to`/`asOfAt = today` silently excludes
 * every transaction that occurred during today (they fall after midnight UTC).
 */
function rangeEnd(value?: string, tzOffsetMinutes = 0): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) {
    const utcEnd = new Date(`${trimmed}T23:59:59.999Z`);
    if (Number.isNaN(utcEnd.getTime())) return null;
    return new Date(utcEnd.getTime() - tzOffsetMinutes * 60_000);
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
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
    @Query('tzOffsetMinutes') tzOffsetMinutes?: string,
  ) {
    const userId = (req.user as any).id;
    await this.billing.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    const tz = parseTzOffsetMinutes(tzOffsetMinutes);
    return this.reports.getProfitAndLoss(branchId, {
      from: rangeStart(from, tz),
      to: rangeEnd(to, tz),
    });
  }

  /**
   * One P&L per day across a range, in a single request.
   *
   * The branch Dashboard draws a month of daily profit. It was getting it by
   * firing one `profit-loss` call per day — up to 31 in parallel, each of which
   * re-scans the branch's checkouts, recomputes weighted-average cost for every
   * product sold, and re-reads the expense table. Every month switch paid for
   * the lot again. This does the three reads once and buckets them, so a month
   * costs about what a day used to.
   */
  @Get(':branchId/profit-loss/series')
  async profitLossSeries(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tzOffsetMinutes') tzOffsetMinutes?: string,
  ) {
    const userId = (req.user as any).id;
    await this.billing.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    const tz = parseTzOffsetMinutes(tzOffsetMinutes);
    return this.reports.getProfitAndLossSeries(branchId, {
      from: rangeStart(from, tz),
      to: rangeEnd(to, tz),
      tzOffsetMinutes: tz,
    });
  }

  @Get(':branchId/balance-sheet')
  async balanceSheet(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('asOfAt') asOfAt?: string,
    @Query('tzOffsetMinutes') tzOffsetMinutes?: string,
  ) {
    const userId = (req.user as any).id;
    await this.billing.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.reports.getBalanceSheet(branchId, {
      asOfAt: rangeEnd(asOfAt, parseTzOffsetMinutes(tzOffsetMinutes)),
    });
  }

  @Get(':branchId/trial-balance')
  async trialBalance(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('asOfAt') asOfAt?: string,
    @Query('tzOffsetMinutes') tzOffsetMinutes?: string,
  ) {
    const userId = (req.user as any).id;
    await this.billing.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.reports.getTrialBalance(branchId, {
      asOfAt: rangeEnd(asOfAt, parseTzOffsetMinutes(tzOffsetMinutes)),
    });
  }
}
