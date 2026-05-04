import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
import { SettleBranchAccruedLiabilityDto } from './dto/settle-branch-accrued-liability.dto';
import { StartBranchRenewalDto } from './dto/start-branch-renewal.dto';

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

  @Get('branches/:branchId/payments')
  async listBranchPayments(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchOwnedBy(branchId, userId);
    return this.billingService.listBranchPayments(branchId);
  }

  @Post('branches/:branchId/renew')
  async renewBranch(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: StartBranchRenewalDto,
  ) {
    const user = req.user as any;
    await this.billingService.assertBranchOwnedBy(branchId, user.id);
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
    await this.billingService.assertBranchOwnedBy(branchId, userId);
    const payment = await this.billingService.getPaymentForReceipt(
      branchId,
      paymentId,
    );
    const html = this.renderReceiptHtml(branchId, payment);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('branches/:branchId/expenses')
  async listExpenses(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchOwnedBy(branchId, userId);
    return this.billingService.listBranchExpenses(branchId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Post('branches/:branchId/expenses')
  async createExpense(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: CreateBranchExpenseDto,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchOwnedBy(branchId, userId);
    return this.billingService.createBranchExpense(branchId, userId, {
      category: dto.category,
      amount: dto.amount,
      currency: dto.currency,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      note: dto.note,
    });
  }

  @Delete('branches/:branchId/expenses/:expenseId')
  async deleteExpense(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('expenseId', ParseIntPipe) expenseId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchOwnedBy(branchId, userId);
    await this.billingService.deleteBranchExpense(branchId, expenseId);
    return { ok: true };
  }

  @Get('branches/:branchId/fixed-assets')
  async listFixedAssets(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchOwnedBy(branchId, userId);
    return this.billingService.listBranchFixedAssets(branchId);
  }

  @Post('branches/:branchId/fixed-assets')
  async createFixedAsset(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: CreateBranchFixedAssetDto,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchOwnedBy(branchId, userId);
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
    await this.billingService.assertBranchOwnedBy(branchId, userId);
    await this.billingService.deleteBranchFixedAsset(branchId, assetId);
    return { ok: true };
  }

  @Get('branches/:branchId/depreciation-entries')
  async listDepreciationEntries(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchOwnedBy(branchId, userId);
    return this.billingService.listBranchDepreciationEntries(branchId);
  }

  @Post('branches/:branchId/depreciation-entries')
  async createDepreciationEntry(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: CreateBranchDepreciationEntryDto,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchOwnedBy(branchId, userId);
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
    await this.billingService.assertBranchOwnedBy(branchId, userId);
    await this.billingService.deleteBranchDepreciationEntry(branchId, entryId);
    return { ok: true };
  }

  @Get('branches/:branchId/accrued-liabilities')
  async listAccruedLiabilities(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchOwnedBy(branchId, userId);
    return this.billingService.listBranchAccruedLiabilities(branchId);
  }

  @Post('branches/:branchId/accrued-liabilities')
  async createAccruedLiability(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: CreateBranchAccruedLiabilityDto,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchOwnedBy(branchId, userId);
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
    await this.billingService.assertBranchOwnedBy(branchId, userId);
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
    await this.billingService.assertBranchOwnedBy(branchId, userId);
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
    await this.billingService.assertBranchOwnedBy(branchId, userId);
    return this.billingService.listBranchLongTermDebts(branchId);
  }

  @Post('branches/:branchId/long-term-debts')
  async createLongTermDebt(
    @Req() req: AuthenticatedRequest,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() dto: CreateBranchLongTermDebtDto,
  ) {
    const userId = (req.user as any).id;
    await this.billingService.assertBranchOwnedBy(branchId, userId);
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
    await this.billingService.assertBranchOwnedBy(branchId, userId);
    await this.billingService.deleteBranchLongTermDebt(branchId, debtId);
    return { ok: true };
  }

  private renderReceiptHtml(
    branchId: number,
    payment: {
      id: number;
      merch_order_id: string;
      status: string;
      amount: number;
      currency?: string | null;
      payer_account?: string | null;
      trans_id?: string | null;
      issuer_trans_id?: string | null;
      created_at: Date;
    },
  ): string {
    const escape = (v: string | null | undefined) =>
      String(v ?? '').replace(
        /[&<>"']/g,
        (c) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[c],
      );
    return `<!doctype html><html><head><meta charset="utf-8"/>
<title>Payment Receipt — POSACT-${branchId}</title>
<style>
body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:32px auto;padding:0 20px;color:#111;}
h1{font-size:18px;margin:0 0 16px;border-bottom:1px solid #ddd;padding-bottom:8px;}
table{width:100%;border-collapse:collapse;}
td{padding:6px 0;vertical-align:top;}
td.k{color:#666;width:160px;}
.amount{font-size:24px;font-weight:600;margin:16px 0;}
.status{display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;}
.status.SUCCESS{background:#dcfce7;color:#15803d;}
.status.PENDING{background:#fef3c7;color:#92400e;}
.status.FAILED,.status.ERROR{background:#fee2e2;color:#991b1b;}
.print{margin-top:24px;}
@media print{.print{display:none;}}
</style></head><body>
<h1>Suuq POS — Payment Receipt</h1>
<div class="amount">${escape(payment.currency || 'ETB')} ${Number(payment.amount).toFixed(2)}</div>
<div><span class="status ${escape(payment.status)}">${escape(payment.status)}</span></div>
<table>
<tr><td class="k">Reference</td><td>${escape(payment.merch_order_id)}</td></tr>
<tr><td class="k">Branch</td><td>#${branchId}</td></tr>
<tr><td class="k">Payer account</td><td>${escape(payment.payer_account)}</td></tr>
<tr><td class="k">Ebirr transaction</td><td>${escape(payment.trans_id)}</td></tr>
<tr><td class="k">Issuer transaction</td><td>${escape(payment.issuer_trans_id)}</td></tr>
<tr><td class="k">Created at</td><td>${escape(new Date(payment.created_at).toISOString())}</td></tr>
</table>
<div class="print"><button onclick="window.print()">Print receipt</button></div>
</body></html>`;
  }
}
