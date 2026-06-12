import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { GeneralLedgerService } from '../accounting/general-ledger.service';
import { GlAccountCode } from '../accounting/gl-accounts.constant';
import { GlJournalSourceType } from '../accounting/entities/gl-journal-entry.entity';
import { BranchStaffService } from '../branch-staff/branch-staff.service';
import { Branch } from '../branches/entities/branch.entity';
import { UserRole } from '../auth/roles.enum';
import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { POS_WORKSPACE_REFERENCE_PREFIX } from '../branch-staff/pos-workspace-activation.service';
import {
  BranchAccruedLiability,
  BranchAccruedLiabilityStatus,
} from './entities/branch-accrued-liability.entity';
import { BranchDepreciationEntry } from './entities/branch-depreciation-entry.entity';
import { BranchExpense } from './entities/branch-expense.entity';
import {
  BranchFixedAsset,
  BranchFixedAssetStatus,
} from './entities/branch-fixed-asset.entity';
import {
  BranchLongTermDebt,
  BranchLongTermDebtStatus,
} from './entities/branch-long-term-debt.entity';

export interface OwnerBranchBilling {
  branchId: number;
  branchName: string;
  serviceFormat: string | null;
  workspaceStatus: string | null;
  canStartRenewal: boolean;
  activationBlockers: string[];
  subscription: {
    period: string | null;
    status: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    autoRenew: boolean;
    amountTotal: number | null;
    currency: string | null;
  } | null;
  lastPayment: {
    referenceId: string;
    amount: number;
    currency: string | null;
    status: string;
    paidAt: Date;
  } | null;
  nextRenewalAt: Date | null;
}

@Injectable()
export class BranchBillingService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
    @InjectRepository(TenantSubscription)
    private readonly subscriptionsRepo: Repository<TenantSubscription>,
    @InjectRepository(EbirrTransaction)
    private readonly ebirrRepo: Repository<EbirrTransaction>,
    @InjectRepository(BranchExpense)
    private readonly expensesRepo: Repository<BranchExpense>,
    @InjectRepository(BranchFixedAsset)
    private readonly fixedAssetsRepo: Repository<BranchFixedAsset>,
    @InjectRepository(BranchDepreciationEntry)
    private readonly depreciationEntriesRepo: Repository<BranchDepreciationEntry>,
    @InjectRepository(BranchAccruedLiability)
    private readonly accruedLiabilitiesRepo: Repository<BranchAccruedLiability>,
    @InjectRepository(BranchLongTermDebt)
    private readonly longTermDebtRepo: Repository<BranchLongTermDebt>,
    private readonly branchStaffService: BranchStaffService,
    private readonly generalLedger: GeneralLedgerService,
  ) {}

  private readonly logger = new Logger(BranchBillingService.name);

  /** Map an expense / accrued-liability category to its GL expense account. */
  private expenseAccountFor(category: string): GlAccountCode {
    switch (String(category || '').toUpperCase()) {
      case 'RENT':
        return GlAccountCode.EXPENSE_RENT;
      case 'UTILITIES':
        return GlAccountCode.EXPENSE_UTILITIES;
      case 'PAYROLL':
        return GlAccountCode.EXPENSE_PAYROLL;
      case 'SUPPLIES':
        return GlAccountCode.EXPENSE_SUPPLIES;
      case 'MARKETING':
        return GlAccountCode.EXPENSE_MARKETING;
      case 'MAINTENANCE':
        return GlAccountCode.EXPENSE_MAINTENANCE;
      case 'TAX':
      case 'TAXES':
        return GlAccountCode.EXPENSE_TAXES;
      case 'INTEREST':
        return GlAccountCode.EXPENSE_INTEREST;
      default:
        return GlAccountCode.EXPENSE_OTHER;
    }
  }

  /** Post a simple two-leg entry (best-effort — billing is the source of truth). */
  private async postLedger(input: {
    branchId: number;
    occurredAt: Date;
    sourceType: GlJournalSourceType;
    sourceId: string;
    idempotencyKey: string;
    currency?: string;
    memo: string;
    debit: GlAccountCode;
    credit: GlAccountCode;
    amount: number;
  }): Promise<void> {
    const amount =
      Math.round((Number(input.amount || 0) + Number.EPSILON) * 100) / 100;
    if (amount <= 0) return;
    await this.generalLedger
      .post({
        branchId: input.branchId,
        occurredAt: input.occurredAt,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        currency: input.currency || 'ETB',
        memo: input.memo,
        lines: [
          { accountCode: input.debit, debit: amount },
          { accountCode: input.credit, credit: amount },
        ],
      })
      .catch((error) =>
        this.logger.warn(
          `GL posting failed (${input.idempotencyKey}): ${
            error instanceof Error ? error.message : error
          }`,
        ),
      );
  }

  /** Reverse a previously-posted entry when its source row is deleted. */
  private async reverseLedger(
    branchId: number,
    idempotencyKey: string,
    occurredAt?: Date,
  ): Promise<void> {
    try {
      const entry = await this.generalLedger.findEntryByIdempotencyKey(
        branchId,
        idempotencyKey,
      );
      if (entry) {
        await this.generalLedger.reverse(entry.id, {
          sourceType: GlJournalSourceType.MANUAL,
          idempotencyKey: `reverse-${idempotencyKey}`,
          occurredAt: occurredAt || new Date(),
          memo: `Reversal of ${idempotencyKey}`,
        });
      }
    } catch (error) {
      this.logger.warn(
        `GL reversal failed (${idempotencyKey}): ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /** Return per-branch billing summary for branches owned by the user. */
  async listOwnerBranches(
    userId: number,
    roles: string[] = [],
  ): Promise<OwnerBranchBilling[]> {
    const branches = await this.branchesRepo.find({
      where: { ownerId: userId, isActive: true },
      order: { name: 'ASC' },
    });
    if (!branches.length) return [];

    const branchIds = branches.map((b) => b.id);
    const subs = await this.subscriptionsRepo.find({
      where: { branchId: In(branchIds) },
      order: { createdAt: 'DESC' },
    });
    const subByBranch = new Map<number, TenantSubscription>();
    for (const s of subs) {
      if (s.branchId == null) continue;
      if (!subByBranch.has(s.branchId)) subByBranch.set(s.branchId, s);
    }

    const lastPaymentByBranch =
      await this.findLastPaymentsForBranches(branchIds);
    const [activeSummaries, activationCandidates] = await Promise.all([
      this.branchStaffService.getPosBranchSummariesForUser({
        id: userId,
        roles,
      }),
      this.branchStaffService.getPosWorkspaceActivationCandidatesForUser({
        id: userId,
        roles,
      }),
    ]);
    const workspaceStatusByBranch = new Map<
      number,
      Pick<
        OwnerBranchBilling,
        'workspaceStatus' | 'canStartRenewal' | 'activationBlockers'
      >
    >(
      activeSummaries.map((summary) => [
        summary.branchId,
        {
          workspaceStatus: summary.workspaceStatus,
          canStartRenewal: false,
          activationBlockers: [],
        },
      ]),
    );
    for (const candidate of activationCandidates) {
      workspaceStatusByBranch.set(candidate.branchId, {
        workspaceStatus: candidate.workspaceStatus,
        canStartRenewal: Boolean(candidate.canStartActivation),
        activationBlockers: candidate.activationBlockers || [],
      });
    }

    return branches.map((branch) => {
      const sub = subByBranch.get(branch.id) || null;
      const meta = (sub?.metadata as any) || {};
      const workspace = workspaceStatusByBranch.get(branch.id) || {
        workspaceStatus: null,
        canStartRenewal: false,
        activationBlockers: [],
      };
      return {
        branchId: branch.id,
        branchName: branch.name,
        serviceFormat: (branch as any).serviceFormat ?? null,
        workspaceStatus: workspace.workspaceStatus,
        canStartRenewal: workspace.canStartRenewal,
        activationBlockers: workspace.activationBlockers,
        subscription: sub
          ? {
              period:
                (meta.subscriptionPeriod as string) ||
                (sub as any).billingInterval ||
                null,
              status: sub.status,
              startsAt: sub.startsAt ?? null,
              endsAt: sub.endsAt ?? null,
              autoRenew: Boolean(sub.autoRenew),
              amountTotal:
                sub.amountTotal != null ? Number(sub.amountTotal) : null,
              currency: sub.currency ?? null,
            }
          : null,
        lastPayment: lastPaymentByBranch.get(branch.id) || null,
        nextRenewalAt: sub?.endsAt ?? null,
      };
    });
  }

  async assertBranchOwnedBy(
    branchId: number,
    userId: number,
    roles: string[] = [],
  ): Promise<Branch> {
    const branch = await this.branchesRepo.findOne({
      where: { id: branchId },
    });
    if (!branch) throw new NotFoundException(`Branch #${branchId} not found.`);
    // Platform admins may operate any branch as its owner (SUPER_ADMIN can act
    // as any vendor; see VendorPermissionGuard). Everyone else must own it.
    const isPlatformAdmin =
      Array.isArray(roles) &&
      (roles.includes(UserRole.SUPER_ADMIN) || roles.includes(UserRole.ADMIN));
    if (!isPlatformAdmin && branch.ownerId !== userId) {
      throw new ForbiddenException('You do not own this branch.');
    }
    return branch;
  }

  /** Return Ebirr ledger entries scoped to a branch's POS activation refs. */
  async listBranchPayments(branchId: number) {
    const prefix = `${POS_WORKSPACE_REFERENCE_PREFIX}-${branchId}-`;
    const rows = await this.ebirrRepo
      .createQueryBuilder('e')
      .where('e.merch_order_id LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('e.created_at', 'DESC')
      .getMany();
    return rows.map((row) => ({
      id: row.id,
      referenceId: row.merch_order_id,
      status: row.status,
      amount: Number(row.amount),
      currency: row.currency || 'ETB',
      payerAccount: row.payer_account || null,
      transactionId: row.trans_id || null,
      issuerTransactionId: row.issuer_trans_id || null,
      requestTimestamp: row.request_timestamp || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getPaymentForReceipt(branchId: number, paymentId: number) {
    const prefix = `${POS_WORKSPACE_REFERENCE_PREFIX}-${branchId}-`;
    const row = await this.ebirrRepo.findOne({ where: { id: paymentId } });
    if (!row) throw new NotFoundException(`Payment #${paymentId} not found.`);
    if (!row.merch_order_id.startsWith(prefix)) {
      throw new ForbiddenException(
        'Payment does not belong to the requested branch.',
      );
    }
    return row;
  }

  async listBranchExpenses(
    branchId: number,
    range: { from?: Date; to?: Date } = {},
  ) {
    const where: any = { branchId };
    if (range.from && range.to) {
      where.occurredAt = Between(range.from, range.to);
    }
    return this.expensesRepo.find({ where, order: { occurredAt: 'DESC' } });
  }

  async createBranchExpense(
    branchId: number,
    userId: number,
    dto: {
      category: string;
      amount: number;
      currency?: string;
      occurredAt?: Date;
      note?: string;
    },
  ): Promise<BranchExpense> {
    const expense = this.expensesRepo.create({
      branchId,
      category: dto.category as any,
      amount: dto.amount,
      currency: dto.currency || 'ETB',
      occurredAt: dto.occurredAt || new Date(),
      note: dto.note ?? null,
      recordedByUserId: userId,
    });
    const saved = await this.expensesRepo.save(expense);
    await this.postLedger({
      branchId,
      occurredAt: saved.occurredAt,
      sourceType: GlJournalSourceType.EXPENSE,
      sourceId: `expense-${saved.id}`,
      idempotencyKey: `expense-${saved.id}`,
      currency: saved.currency,
      memo: `Expense — ${saved.category}`,
      debit: this.expenseAccountFor(saved.category),
      credit: GlAccountCode.CASH,
      amount: Number(saved.amount),
    });
    return saved;
  }

  async deleteBranchExpense(
    branchId: number,
    expenseId: number,
  ): Promise<void> {
    const expense = await this.expensesRepo.findOne({
      where: { id: expenseId, branchId },
    });
    if (!expense) {
      throw new NotFoundException(
        `Expense #${expenseId} not found for branch #${branchId}.`,
      );
    }
    await this.reverseLedger(
      branchId,
      `expense-${expenseId}`,
      expense.occurredAt,
    );
    await this.expensesRepo.remove(expense);
  }

  async listBranchFixedAssets(branchId: number) {
    return this.fixedAssetsRepo.find({
      where: { branchId },
      order: { acquiredAt: 'DESC', id: 'DESC' },
    });
  }

  async createBranchFixedAsset(
    branchId: number,
    dto: {
      name: string;
      category: BranchFixedAsset['category'];
      status?: BranchFixedAsset['status'];
      acquiredAt: Date;
      capitalizationAmount: number;
      salvageValue?: number;
      usefulLifeMonths?: number;
      currency?: string;
      note?: string;
    },
  ): Promise<BranchFixedAsset> {
    const asset = this.fixedAssetsRepo.create({
      branchId,
      name: dto.name,
      category: dto.category,
      status: dto.status || BranchFixedAssetStatus.ACTIVE,
      acquiredAt: dto.acquiredAt,
      capitalizationAmount: dto.capitalizationAmount,
      salvageValue: dto.salvageValue || 0,
      usefulLifeMonths: dto.usefulLifeMonths ?? null,
      currency: dto.currency || 'ETB',
      note: dto.note ?? null,
    });
    const saved = await this.fixedAssetsRepo.save(asset);
    await this.postLedger({
      branchId,
      occurredAt: saved.acquiredAt,
      sourceType: GlJournalSourceType.FIXED_ASSET,
      sourceId: `fixed-asset-${saved.id}`,
      idempotencyKey: `fixed-asset-${saved.id}`,
      currency: saved.currency,
      memo: `Fixed asset — ${saved.name}`,
      debit: GlAccountCode.FIXED_ASSETS,
      credit: GlAccountCode.CASH,
      amount: Number(saved.capitalizationAmount),
    });
    return saved;
  }

  async deleteBranchFixedAsset(
    branchId: number,
    assetId: number,
  ): Promise<void> {
    const asset = await this.fixedAssetsRepo.findOne({
      where: { id: assetId, branchId },
    });
    if (!asset) {
      throw new NotFoundException(
        `Fixed asset #${assetId} not found for branch #${branchId}.`,
      );
    }
    await this.reverseLedger(
      branchId,
      `fixed-asset-${assetId}`,
      asset.acquiredAt,
    );
    await this.fixedAssetsRepo.remove(asset);
  }

  async listBranchDepreciationEntries(branchId: number) {
    return this.depreciationEntriesRepo.find({
      where: { branchId },
      order: { occurredAt: 'DESC', id: 'DESC' },
    });
  }

  async createBranchDepreciationEntry(
    branchId: number,
    userId: number,
    dto: {
      fixedAssetId: number;
      amount: number;
      occurredAt: Date;
      note?: string;
    },
  ): Promise<BranchDepreciationEntry> {
    const asset = await this.fixedAssetsRepo.findOne({
      where: { id: dto.fixedAssetId, branchId },
    });
    if (!asset) {
      throw new NotFoundException(
        `Fixed asset #${dto.fixedAssetId} not found for branch #${branchId}.`,
      );
    }

    const entry = this.depreciationEntriesRepo.create({
      branchId,
      fixedAssetId: dto.fixedAssetId,
      amount: dto.amount,
      occurredAt: dto.occurredAt,
      note: dto.note ?? null,
      recordedByUserId: userId,
    });
    const saved = await this.depreciationEntriesRepo.save(entry);
    await this.postLedger({
      branchId,
      occurredAt: saved.occurredAt,
      sourceType: GlJournalSourceType.DEPRECIATION,
      sourceId: `depreciation-${saved.id}`,
      idempotencyKey: `depreciation-${saved.id}`,
      currency: asset.currency,
      memo: `Depreciation — asset ${saved.fixedAssetId}`,
      debit: GlAccountCode.EXPENSE_DEPRECIATION,
      credit: GlAccountCode.ACCUMULATED_DEPRECIATION,
      amount: Number(saved.amount),
    });
    return saved;
  }

  async deleteBranchDepreciationEntry(
    branchId: number,
    entryId: number,
  ): Promise<void> {
    const entry = await this.depreciationEntriesRepo.findOne({
      where: { id: entryId, branchId },
    });
    if (!entry) {
      throw new NotFoundException(
        `Depreciation entry #${entryId} not found for branch #${branchId}.`,
      );
    }
    await this.reverseLedger(
      branchId,
      `depreciation-${entryId}`,
      entry.occurredAt,
    );
    await this.depreciationEntriesRepo.remove(entry);
  }

  async listBranchAccruedLiabilities(branchId: number) {
    return this.accruedLiabilitiesRepo.find({
      where: { branchId },
      order: { accruedAt: 'DESC', id: 'DESC' },
    });
  }

  async createBranchAccruedLiability(
    branchId: number,
    dto: {
      label: string;
      category: BranchAccruedLiability['category'];
      status?: BranchAccruedLiability['status'];
      amount: number;
      accruedAt: Date;
      dueAt?: Date;
      currency?: string;
      note?: string;
    },
  ): Promise<BranchAccruedLiability> {
    const liability = this.accruedLiabilitiesRepo.create({
      branchId,
      label: dto.label,
      category: dto.category,
      status: dto.status || BranchAccruedLiabilityStatus.OPEN,
      amount: dto.amount,
      accruedAt: dto.accruedAt,
      dueAt: dto.dueAt ?? null,
      currency: dto.currency || 'ETB',
      note: dto.note ?? null,
    });
    const saved = await this.accruedLiabilitiesRepo.save(liability);
    await this.postLedger({
      branchId,
      occurredAt: saved.accruedAt,
      sourceType: GlJournalSourceType.ACCRUED_LIABILITY,
      sourceId: `accrued-${saved.id}`,
      idempotencyKey: `accrued-${saved.id}`,
      currency: saved.currency,
      memo: `Accrued liability — ${saved.label}`,
      debit: this.expenseAccountFor(saved.category),
      credit: GlAccountCode.ACCRUED_LIABILITIES,
      amount: Number(saved.amount),
    });
    return saved;
  }

  async deleteBranchAccruedLiability(
    branchId: number,
    liabilityId: number,
  ): Promise<void> {
    const liability = await this.accruedLiabilitiesRepo.findOne({
      where: { id: liabilityId, branchId },
    });
    if (!liability) {
      throw new NotFoundException(
        `Accrued liability #${liabilityId} not found for branch #${branchId}.`,
      );
    }
    await this.reverseLedger(
      branchId,
      `accrued-${liabilityId}`,
      liability.accruedAt,
    );
    await this.accruedLiabilitiesRepo.remove(liability);
  }

  async settleBranchAccruedLiability(
    branchId: number,
    liabilityId: number,
    settledAt?: Date,
  ): Promise<BranchAccruedLiability> {
    const liability = await this.accruedLiabilitiesRepo.findOne({
      where: { id: liabilityId, branchId },
    });
    if (!liability) {
      throw new NotFoundException(
        `Accrued liability #${liabilityId} not found for branch #${branchId}.`,
      );
    }

    liability.status = BranchAccruedLiabilityStatus.SETTLED;
    liability.settledAt = settledAt || new Date();
    const saved = await this.accruedLiabilitiesRepo.save(liability);
    await this.postLedger({
      branchId,
      occurredAt: saved.settledAt || new Date(),
      sourceType: GlJournalSourceType.ACCRUED_SETTLEMENT,
      sourceId: `accrued-settle-${liabilityId}`,
      idempotencyKey: `accrued-settle-${liabilityId}`,
      currency: saved.currency,
      memo: `Accrued liability settled — ${saved.label}`,
      debit: GlAccountCode.ACCRUED_LIABILITIES,
      credit: GlAccountCode.CASH,
      amount: Number(saved.amount),
    });
    return saved;
  }

  async listBranchLongTermDebts(branchId: number) {
    return this.longTermDebtRepo.find({
      where: { branchId },
      order: { issuedAt: 'DESC', id: 'DESC' },
    });
  }

  async createBranchLongTermDebt(
    branchId: number,
    dto: {
      lenderName: string;
      status?: BranchLongTermDebt['status'];
      principalAmount: number;
      outstandingPrincipal: number;
      currentPortionAmount?: number;
      interestRate?: number;
      issuedAt: Date;
      maturityAt?: Date;
      currency?: string;
      note?: string;
    },
  ): Promise<BranchLongTermDebt> {
    const debt = this.longTermDebtRepo.create({
      branchId,
      lenderName: dto.lenderName,
      status: dto.status || BranchLongTermDebtStatus.ACTIVE,
      principalAmount: dto.principalAmount,
      outstandingPrincipal: dto.outstandingPrincipal,
      currentPortionAmount: dto.currentPortionAmount || 0,
      interestRate: dto.interestRate ?? null,
      issuedAt: dto.issuedAt,
      maturityAt: dto.maturityAt ?? null,
      currency: dto.currency || 'ETB',
      note: dto.note ?? null,
    });
    const saved = await this.longTermDebtRepo.save(debt);
    // Drawing the loan brings in cash against a long-term liability.
    await this.postLedger({
      branchId,
      occurredAt: saved.issuedAt,
      sourceType: GlJournalSourceType.LONG_TERM_DEBT,
      sourceId: `ltdebt-${saved.id}`,
      idempotencyKey: `ltdebt-${saved.id}`,
      currency: saved.currency,
      memo: `Long-term debt — ${saved.lenderName}`,
      debit: GlAccountCode.CASH,
      credit: GlAccountCode.LONG_TERM_DEBT,
      amount: Number(saved.principalAmount),
    });
    return saved;
  }

  async deleteBranchLongTermDebt(
    branchId: number,
    debtId: number,
  ): Promise<void> {
    const debt = await this.longTermDebtRepo.findOne({
      where: { id: debtId, branchId },
    });
    if (!debt) {
      throw new NotFoundException(
        `Long-term debt #${debtId} not found for branch #${branchId}.`,
      );
    }
    await this.reverseLedger(branchId, `ltdebt-${debtId}`, debt.issuedAt);
    await this.longTermDebtRepo.remove(debt);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async findLastPaymentsForBranches(
    branchIds: number[],
  ): Promise<Map<number, OwnerBranchBilling['lastPayment']>> {
    const result = new Map<number, OwnerBranchBilling['lastPayment']>();
    if (!branchIds.length) return result;

    for (const branchId of branchIds) {
      const prefix = `${POS_WORKSPACE_REFERENCE_PREFIX}-${branchId}-`;
      const row = await this.ebirrRepo
        .createQueryBuilder('e')
        .where('e.merch_order_id LIKE :prefix', { prefix: `${prefix}%` })
        .andWhere(`e.status IN ('SUCCESS', 'APPROVED')`)
        .orderBy('e.created_at', 'DESC')
        .limit(1)
        .getOne();
      if (row) {
        result.set(branchId, {
          referenceId: row.merch_order_id,
          amount: Number(row.amount),
          currency: row.currency || 'ETB',
          status: row.status,
          paidAt: row.created_at,
        });
      }
    }
    return result;
  }
}
