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
      from: from ? new Date(from) : null,
      to: to ? new Date(to) : null,
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
      asOfAt: asOfAt ? new Date(asOfAt) : null,
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
      asOfAt: asOfAt ? new Date(asOfAt) : null,
    });
  }
}
