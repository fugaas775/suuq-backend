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
    const html = this.renderReceiptHtml(
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

  /**
   * A receipt is evidence that money was received, so it is only ever titled
   * one when the payment is PAID. Anything else prints as a payment record that
   * says plainly it is not a receipt — an owner must not be able to hand an
   * accountant a "receipt" for a charge that failed.
   *
   * The seller block is read from the environment (BILLING_SELLER_NAME /
   * _TIN / _ADDRESS / _VAT_NOTE) and a line is printed only when it is set:
   * a tax number or a VAT statement is never invented here.
   */
  private renderReceiptHtml(
    branch: { id: number; name: string },
    payment: Awaited<ReturnType<BranchBillingService['getPaymentForReceipt']>>,
  ): string {
    const escape = (v: unknown) =>
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
    const env = (key: string) => String(process.env[key] || '').trim();
    const sellerName = env('BILLING_SELLER_NAME') || 'Suuq S';
    const sellerTin = env('BILLING_SELLER_TIN');
    const sellerAddress = env('BILLING_SELLER_ADDRESS');
    const vatNote = env('BILLING_SELLER_VAT_NOTE');
    const paid = payment.state === 'PAID';
    const currency = payment.currency || 'ETB';
    const amount = Number(payment.amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const when = (value: Date | string | null | undefined, withTime = true) => {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Addis_Ababa',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      }).format(date);
    };
    const planLabel =
      payment.periodMonths === 12
        ? 'POS branch subscription — 1 year'
        : payment.periodMonths === 1
          ? 'POS branch subscription — 1 month'
          : payment.periodMonths
            ? `POS branch subscription — ${payment.periodMonths} months`
            : 'POS branch subscription';
    const covered =
      paid && payment.termStartsAt
        ? `${when(payment.termStartsAt, false)} – ${when(payment.termEndsAt, false) || 'open'}`
        : '';
    const stateLabel: Record<string, string> = {
      PAID: 'Paid',
      PENDING: 'Awaiting confirmation',
      FAILED: 'Not completed',
      EXPIRED: 'Expired — not charged',
    };
    const row = (label: string, value: unknown) =>
      value
        ? `<tr><td class="k">${escape(label)}</td><td>${escape(value)}</td></tr>`
        : '';
    const title = paid ? 'Payment receipt' : 'Payment record';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escape(title)} ${escape(payment.receiptNumber || payment.referenceId)}</title>
<style>
body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:32px auto;padding:0 20px;color:#111;line-height:1.45;}
header{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #ddd;padding-bottom:12px;margin-bottom:16px;}
h1{font-size:18px;margin:0;}
.seller{font-size:13px;color:#444;}
.no{font-size:13px;color:#444;text-align:right;}
table{width:100%;border-collapse:collapse;}
td{padding:6px 0;vertical-align:top;border-bottom:1px solid #f0f0f0;}
td.k{color:#666;width:180px;}
.amount{font-size:26px;font-weight:600;margin:16px 0 4px;}
.status{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;margin-bottom:12px;}
.status.PAID{background:#dcfce7;color:#15803d;}
.status.PENDING{background:#fef3c7;color:#92400e;}
.status.FAILED,.status.EXPIRED{background:#fee2e2;color:#991b1b;}
.notice{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;font-size:13px;margin:12px 0;}
.foot{font-size:12px;color:#666;margin-top:20px;}
.print{margin-top:24px;}
@media print{.print{display:none;}body{margin:0 auto;}}
</style></head><body>
<header>
<div><h1>${escape(title)}</h1>
<div class="seller">${escape(sellerName)}${sellerAddress ? `<br/>${escape(sellerAddress)}` : ''}${sellerTin ? `<br/>TIN ${escape(sellerTin)}` : ''}</div></div>
<div class="no">${payment.receiptNumber ? `No. ${escape(payment.receiptNumber)}<br/>` : ''}${escape(when(payment.paidAt || payment.createdAt))}</div>
</header>
<div class="amount">${escape(currency)} ${escape(amount)}</div>
<div><span class="status ${escape(payment.state)}">${escape(stateLabel[payment.state] || payment.state)}</span></div>
${paid ? '' : '<div class="notice">This is not a receipt. No payment was confirmed for this request.</div>'}
<table>
${row('Billed to', `${branch.name} (branch #${branch.id})`)}
${row('For', planLabel)}
${row('Period covered', covered)}
${row('Payment method', 'Ebirr mobile money')}
${row('Payer account', payment.payerAccount)}
${row(paid ? 'Paid on' : 'Requested on', when(paid ? payment.paidAt : payment.createdAt))}
${row('Payment reference', payment.referenceId)}
${row('Ebirr transaction', payment.transactionId)}
${row('Issuer transaction', payment.issuerTransactionId)}
</table>
${vatNote ? `<div class="foot">${escape(vatNote)}</div>` : ''}
<div class="foot">Times are East Africa Time (UTC+3). Keep this page for your records.</div>
<div class="print"><button onclick="window.print()">Print</button></div>
</body></html>`;
  }
}
