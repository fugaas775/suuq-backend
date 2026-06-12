import { Injectable, Logger } from '@nestjs/common';
import { GeneralLedgerService } from '../accounting/general-ledger.service';
import { GlJournalSourceType } from '../accounting/entities/gl-journal-entry.entity';
import { LedgerStatementsService } from '../accounting/ledger-statements.service';
import {
  buildOpeningBalanceLines,
  reconcileStatements,
  ReconciliationResult,
} from '../accounting/reconciliation.util';
import { BranchFinancialReportsService } from './branch-financial-reports.service';

/**
 * Bridges the legacy derived reports and the ledger-computed statements so the
 * ledger can be (1) primed with opening balances and (2) reconciled against the
 * derived numbers before the report endpoints are cut over. This is the gate:
 * the ledger is only trusted once reconcileBranch() reports `matched: true`.
 */
@Injectable()
export class LedgerReconciliationService {
  private readonly logger = new Logger(LedgerReconciliationService.name);

  constructor(
    private readonly legacyReports: BranchFinancialReportsService,
    private readonly ledgerStatements: LedgerStatementsService,
    private readonly generalLedger: GeneralLedgerService,
  ) {}

  /**
   * Post the one-time OPENING_BALANCE entry that sets each control account to its
   * legacy-derived balance at `asOfAt`. Idempotent per branch.
   */
  async seedOpeningBalance(branchId: number, asOfAt: Date) {
    const bs = await this.legacyReports.getBalanceSheet(branchId, { asOfAt });
    const lines = buildOpeningBalanceLines({
      assets: {
        cash: bs.assets.cash,
        tenderClearing: bs.assets.tenderClearing,
        inventoryValue: bs.assets.inventoryValue,
        fixedAssetsGross: bs.assets.fixedAssetsGross,
        accumulatedDepreciation: bs.assets.accumulatedDepreciation,
        fixedAssetsNet: bs.assets.fixedAssetsNet,
        total: bs.assets.total,
      },
      liabilities: {
        supplierPayables: bs.liabilities.supplierPayables,
        taxPayable: bs.liabilities.taxPayable,
        accruedLiabilities: bs.liabilities.accruedLiabilities,
        currentPortionLongTermDebt: bs.liabilities.currentPortionLongTermDebt,
        longTermDebt: bs.liabilities.nonCurrent.longTermDebt,
        total: bs.liabilities.total,
      },
      equity: bs.equity,
    });
    if (!lines.length) {
      return { posted: false, branchId };
    }
    const entry = await this.generalLedger.post({
      branchId,
      occurredAt: asOfAt,
      sourceType: GlJournalSourceType.OPENING_BALANCE,
      sourceId: `opening-${branchId}`,
      idempotencyKey: `opening-balance-${branchId}`,
      currency: bs.currency,
      memo: `Opening balances as of ${asOfAt.toISOString()}`,
      lines,
    });
    return { posted: true, branchId, entryId: entry.id };
  }

  /**
   * Reconcile the derived statements against the ledger for a branch. The period
   * drives the P&L; `asOfAt` drives the balance sheet (defaults to the period end).
   */
  async reconcileBranch(
    branchId: number,
    range: { from?: Date | null; to?: Date | null; asOfAt?: Date } = {},
  ): Promise<ReconciliationResult> {
    const asOfAt = range.asOfAt ?? range.to ?? new Date();
    const [legacyBS, legacyPL, ledgerBS, ledgerPL] = await Promise.all([
      this.legacyReports.getBalanceSheet(branchId, { asOfAt }),
      this.legacyReports.getProfitAndLoss(branchId, {
        from: range.from ?? null,
        to: range.to ?? null,
      }),
      this.ledgerStatements.getBalanceSheet(branchId, asOfAt),
      this.ledgerStatements.getProfitAndLoss(branchId, {
        from: range.from ?? null,
        to: range.to ?? null,
      }),
    ]);

    const result = reconcileStatements({
      legacyBS: {
        assets: {
          cash: legacyBS.assets.cash,
          tenderClearing: legacyBS.assets.tenderClearing,
          inventoryValue: legacyBS.assets.inventoryValue,
          fixedAssetsGross: legacyBS.assets.fixedAssetsGross,
          accumulatedDepreciation: legacyBS.assets.accumulatedDepreciation,
          fixedAssetsNet: legacyBS.assets.fixedAssetsNet,
          total: legacyBS.assets.total,
        },
        liabilities: {
          supplierPayables: legacyBS.liabilities.supplierPayables,
          taxPayable: legacyBS.liabilities.taxPayable,
          accruedLiabilities: legacyBS.liabilities.accruedLiabilities,
          currentPortionLongTermDebt:
            legacyBS.liabilities.currentPortionLongTermDebt,
          longTermDebt: legacyBS.liabilities.nonCurrent.longTermDebt,
          total: legacyBS.liabilities.total,
        },
        equity: legacyBS.equity,
      },
      ledgerBS,
      legacyPL: {
        revenue: { net: legacyPL.revenue.net, tax: legacyPL.revenue.tax },
        cogs: legacyPL.cogs,
        totalExpenses: legacyPL.totalExpenses,
        netProfit: legacyPL.netProfit,
      },
      ledgerPL,
    });

    if (!result.matched) {
      this.logger.warn(
        `Ledger reconciliation MISMATCH for branch ${branchId}: ${result.discrepancies
          .map((d) => `${d.line} Δ${d.diff}`)
          .join(', ')}`,
      );
    }
    return result;
  }
}
