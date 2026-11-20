import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { PosWorkspaceActivationService } from '../branch-staff/pos-workspace-activation.service';
import { BranchBillingService } from './branch-billing.service';
import { CreateBranchAccruedLiabilityDto } from './dto/create-branch-accrued-liability.dto';
import { CreateBranchDepreciationEntryDto } from './dto/create-branch-depreciation-entry.dto';
import { CreateBranchExpenseDto } from './dto/create-branch-expense.dto';
import { CreateBranchFixedAssetDto } from './dto/create-branch-fixed-asset.dto';
import { CreateBranchLongTermDebtDto } from './dto/create-branch-long-term-debt.dto';
import { VoidBranchExpenseDto } from './dto/void-branch-expense.dto';
import { AmendBranchExpenseDto } from './dto/amend-branch-expense.dto';
import { SettleBranchAccruedLiabilityDto } from './dto/settle-branch-accrued-liability.dto';
import { StartBranchRenewalDto } from './dto/start-branch-renewal.dto';
import { renderSubscriptionReceiptHtml } from './subscription-receipt';

@ApiTags('Owner Billing')
@Controller('seller/v1/billing')
@UseGuards(JwtAuthGuard)
export class OwnerBillingController {
  constructor(
    private readonly billingService: BranchBillingService,
    private readonly activationService: PosWorkspaceActivationService,
  ) {}

  @Get('branches')
  async listBranches(@Req() req: AuthenticatedRequest) {
    const userId = (req.user as any).id;
    return this.billingService.listOwnerBranches(
      userId,
      (req.user as any).roles,
    );
  }

  /** The renewal periods on sale and what each one is charged at. */
  @Get('options')
  listRenewalOptions() {
    return this.billingService.listRenewalOptions();
  }

  @Get('branches/:branchId/payments')
  async listBranchPayments(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchOwnedBy(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.billingService.listBranchPayments(branchId);
  }

  @Post('branches/:branchId/renew')
  async renewBranch(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: StartBranchRenewalDto,
  ) {
    const user = req.user as any;
    await this.billingService.assertBranchOwnedBy(
      branchId,
      user.id,
      user.roles,
    );
    return this.activationService.startEbirrActivationPayment(
      { id: user.id, roles: user.roles },
      {
        branchId,
        phoneNumber: dto.phoneNumber,
        subscriptionPeriod: dto.subscriptionPeriod,
      },
    );
  }

  @Get('branches/:branchId/payments/:paymentId/receipt.html')
  async receiptHtml(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Res() res: Response,
  ) {
    const userId = (req.user as any).id;
    const branch = await this.billingService.assertBranchOwnedBy(
      branchId,
      userId,
      (req.user as any).roles,
    );
    const payment = await this.billingService.getPaymentForReceipt(
      branchId,
      paymentId,
    );
    const html = renderSubscriptionReceiptHtml(
      { id: branchId, name: branch.name },
      payment,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('branches/:branchId/expenses')
  async listExpenses(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('includeVoided') includeVoided?: string,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.billingService.listBranchExpenses(branchId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      // Opt-in, so every caller that asks "what did we spend" is right by
      // default and only the books panel sees the voided rows it exists to show.
      includeVoided: String(includeVoided) === 'true',
    });
  }

  @Post('branches/:branchId/expenses')
  async createExpense(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: CreateBranchExpenseDto,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.billingService.createBranchExpense(branchId, userId, {
      category: dto.category,
      amount: dto.amount,
      currency: dto.currency,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      note: dto.note,
    });
  }

  /**
   * Correct an expense. Voids the wrong row and posts a corrected one, so the
   * books keep both; access and authority are asserted inside the service, which
   * routes this through the same rules as a plain void.
   */
  @Patch('branches/:branchId/expenses/:expenseId')
  async amendExpense(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('expenseId', ParseIntPipe) expenseId: number,
    @Body() dto: AmendBranchExpenseDto,
  ) {
    const user = req.user as any;
    return this.billingService.amendBranchExpense(
      branchId,
      expenseId,
      {
        userId: user.id,
        roles: user.roles,
        name: user.displayName || user.fullName || null,
      },
      {
        category: dto.category,
        amount: dto.amount,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        note: dto.note,
        reason: dto.reason,
      },
    );
  }

  /**
   * There is no DELETE for an expense. Money that left cannot be un-spent, so a
   * mistake is voided — the row survives, carrying who voided it and why, and
   * its ledger entry is reversed in the same transaction.
   *
   * `voidBranchExpense` asserts access itself: the owner-only rules it applies
   * need the branch, and resolving it twice would be a wasted query.
   */
  @Post('branches/:branchId/expenses/:expenseId/void')
  async voidExpense(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('expenseId', ParseIntPipe) expenseId: number,
    @Body() dto: VoidBranchExpenseDto,
  ) {
    const user = req.user as any;
    return this.billingService.voidBranchExpense(
      branchId,
      expenseId,
      {
        userId: user.id,
        roles: user.roles,
        name: user.displayName || user.fullName || null,
      },
      dto.reason,
    );
  }

  @Get('branches/:branchId/fixed-assets')
  async listFixedAssets(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.billingService.listBranchFixedAssets(branchId);
  }

  @Post('branches/:branchId/fixed-assets')
  async createFixedAsset(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: CreateBranchFixedAssetDto,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.billingService.createBranchFixedAsset(branchId, {
      name: dto.name,
      category: dto.category,
      status: dto.status,
      acquiredAt: new Date(dto.acquiredAt),
      capitalizationAmount: dto.capitalizationAmount,
      salvageValue: dto.salvageValue,
      usefulLifeMonths: dto.usefulLifeMonths,
      currency: dto.currency,
      note: dto.note,
    });
  }

  @Delete('branches/:branchId/fixed-assets/:assetId')
  async deleteFixedAsset(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('assetId', ParseIntPipe) assetId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    await this.billingService.deleteBranchFixedAsset(branchId, assetId);
    return { ok: true };
  }

  @Get('branches/:branchId/depreciation-entries')
  async listDepreciationEntries(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.billingService.listBranchDepreciationEntries(branchId);
  }

  @Post('branches/:branchId/depreciation-entries')
  async createDepreciationEntry(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: CreateBranchDepreciationEntryDto,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.billingService.createBranchDepreciationEntry(branchId, userId, {
      fixedAssetId: dto.fixedAssetId,
      amount: dto.amount,
      occurredAt: new Date(dto.occurredAt),
      note: dto.note,
    });
  }

  @Delete('branches/:branchId/depreciation-entries/:entryId')
  async deleteDepreciationEntry(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('entryId', ParseIntPipe) entryId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    await this.billingService.deleteBranchDepreciationEntry(branchId, entryId);
    return { ok: true };
  }

  @Get('branches/:branchId/accrued-liabilities')
  async listAccruedLiabilities(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.billingService.listBranchAccruedLiabilities(branchId);
  }

  @Post('branches/:branchId/accrued-liabilities')
  async createAccruedLiability(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: CreateBranchAccruedLiabilityDto,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.billingService.createBranchAccruedLiability(branchId, {
      label: dto.label,
      category: dto.category,
      status: dto.status,
      amount: dto.amount,
      accruedAt: new Date(dto.accruedAt),
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      currency: dto.currency,
      note: dto.note,
    });
  }

  @Delete('branches/:branchId/accrued-liabilities/:liabilityId')
  async deleteAccruedLiability(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('liabilityId', ParseIntPipe) liabilityId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    await this.billingService.deleteBranchAccruedLiability(
      branchId,
      liabilityId,
    );
    return { ok: true };
  }

  @Post('branches/:branchId/accrued-liabilities/:liabilityId/settle')
  async settleAccruedLiability(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('liabilityId', ParseIntPipe) liabilityId: number,
    @Body() dto: SettleBranchAccruedLiabilityDto,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.billingService.settleBranchAccruedLiability(
      branchId,
      liabilityId,
      dto.settledAt ? new Date(dto.settledAt) : undefined,
    );
  }

  @Get('branches/:branchId/long-term-debts')
  async listLongTermDebts(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.billingService.listBranchLongTermDebts(branchId);
  }

  @Post('branches/:branchId/long-term-debts')
  async createLongTermDebt(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: CreateBranchLongTermDebtDto,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    return this.billingService.createBranchLongTermDebt(branchId, {
      lenderName: dto.lenderName,
      status: dto.status,
      principalAmount: dto.principalAmount,
      outstandingPrincipal: dto.outstandingPrincipal,
      currentPortionAmount: dto.currentPortionAmount,
      interestRate: dto.interestRate,
      issuedAt: new Date(dto.issuedAt),
      maturityAt: dto.maturityAt ? new Date(dto.maturityAt) : undefined,
      currency: dto.currency,
      note: dto.note,
    });
  }

  @Delete('branches/:branchId/long-term-debts/:debtId')
  async deleteLongTermDebt(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('debtId', ParseIntPipe) debtId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchAccountingAccess(
      branchId,
      userId,
      (req.user as any).roles,
    );
    await this.billingService.deleteBranchLongTermDebt(branchId, debtId);
    return { ok: true };
  }
}
