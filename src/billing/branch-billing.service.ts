import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  In,
  IsNull,
  Repository,
} from 'typeorm';
import { GeneralLedgerService } from '../accounting/general-ledger.service';
import { GlAccountCode } from '../accounting/gl-accounts.constant';
import { GlJournalSourceType } from '../accounting/entities/gl-journal-entry.entity';
import { BranchStaffService } from '../branch-staff/branch-staff.service';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from '../branch-staff/entities/branch-staff-assignment.entity';
import { Branch } from '../branches/entities/branch.entity';
import { UserRole } from '../auth/roles.enum';
import { RetailTenant } from '../retail/entities/retail-tenant.entity';
import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { User } from '../users/entities/user.entity';
// Entity-only imports. Billing cannot import PayrollModule or PurchasingModule —
// both of those import BillingModule — but it can hold their repositories, which
// is all `assertExpenseWasHandRecorded` needs to answer "did a run post this?".
import { PayrollRun } from '../payroll/entities/payroll-run.entity';
import { PurchaseRun } from '../purchasing/entities/purchase-run.entity';
import { POS_WORKSPACE_REFERENCE_PREFIX } from '../branch-staff/pos-workspace-activation.service';
import {
  BranchAccruedLiability,
  BranchAccruedLiabilityStatus,
} from './entities/branch-accrued-liability.entity';
import { BranchDepreciationEntry } from './entities/branch-depreciation-entry.entity';
import {
  BranchExpense,
  isLiabilitySettlementCategory,
} from './entities/branch-expense.entity';
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
  /** Open on the auto-provisioned free trial rather than a paid period. */
  isTrialWorkspace: boolean;
  /** When that trial runs out; null for a paid branch. */
  trialEndsAt: Date | null;
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
    // Books/statement access is owner-OR-manager (see
    // `assertBranchAccountingAccess`), so the guard resolves branch authority
    // straight from the assignment + tenant rows rather than paying for the
    // portal's full per-branch workspace resolution on every report call.
    @InjectRepository(BranchStaffAssignment)
    private readonly staffAssignmentsRepo: Repository<BranchStaffAssignment>,
    @InjectRepository(RetailTenant)
    private readonly retailTenantsRepo: Repository<RetailTenant>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(PayrollRun)
    private readonly payrollRunsRepo: Repository<PayrollRun>,
    @InjectRepository(PurchaseRun)
    private readonly purchaseRunsRepo: Repository<PurchaseRun>,
    private readonly dataSource: DataSource,
  ) {}

  private readonly logger = new Logger(BranchBillingService.name);

  /**
   * The account a branch_expenses row debits.
   *
   * Normally an expense account. A TAX_REMITTANCE debits TAX_PAYABLE instead:
   * handing collected VAT to the authority discharges the liability the sale
   * created, it does not buy anything. Posting it as an expense would understate
   * profit by the whole remittance AND leave the liability outstanding, so the
   * branch would look like it still owed money it had already paid.
   *
   * Kept separate from {@link expenseAccountFor} because that one is also the
   * accrued-liability mapping, where a settlement category has no meaning.
   */
  private expenseDebitAccountFor(category: string): GlAccountCode {
    return isLiabilitySettlementCategory(category)
      ? GlAccountCode.TAX_PAYABLE
      : this.expenseAccountFor(category);
  }

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
      // Goods bought to be cooked or resold are a direct cost of sales, not an
      // operating expense. See isPurchasesCategory.
      case 'INGREDIENTS':
        return GlAccountCode.COGS;
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
    const tenantIds = Array.from(
      new Set(
        branches
          .map((b) => b.retailTenantId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );
    const [subs, legacyTenantSubs] = await Promise.all([
      this.subscriptionsRepo.find({
        where: { branchId: In(branchIds) },
        order: { createdAt: 'DESC' },
      }),
      // Rows predating per-branch billing carry branchId null and still govern
      // their tenant's branches; without them a legacy branch reported no
      // subscription at all.
      tenantIds.length
        ? this.subscriptionsRepo.find({
            where: { tenantId: In(tenantIds), branchId: IsNull() },
            order: { createdAt: 'DESC' },
          })
        : Promise.resolve([] as TenantSubscription[]),
    ]);
    const subByBranch = new Map<number, TenantSubscription>();
    for (const s of subs) {
      if (s.branchId == null) continue;
      if (!subByBranch.has(s.branchId)) subByBranch.set(s.branchId, s);
    }
    const legacySubByTenant = new Map<number, TenantSubscription>();
    for (const s of legacyTenantSubs) {
      if (!legacySubByTenant.has(s.tenantId))
        legacySubByTenant.set(s.tenantId, s);
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
        | 'workspaceStatus'
        | 'canStartRenewal'
        | 'activationBlockers'
        | 'isTrialWorkspace'
        | 'trialEndsAt'
      >
    >(
      activeSummaries.map((summary) => [
        summary.branchId,
        {
          workspaceStatus: summary.workspaceStatus,
          // An open branch on a live free trial can be paid for early.
          canStartRenewal: Boolean(summary.canPayNow),
          activationBlockers: [],
          isTrialWorkspace: Boolean(summary.isTrialWorkspace),
          trialEndsAt: summary.isTrialWorkspace
            ? (summary.subscriptionEndsAt ?? null)
            : null,
        },
      ]),
    );
    for (const candidate of activationCandidates) {
      workspaceStatusByBranch.set(candidate.branchId, {
        workspaceStatus: candidate.workspaceStatus,
        canStartRenewal: Boolean(candidate.canPayNow),
        activationBlockers: candidate.activationBlockers || [],
        isTrialWorkspace: false,
        trialEndsAt: null,
      });
    }

    return branches.map((branch) => {
      const sub =
        subByBranch.get(branch.id) ||
        (branch.retailTenantId
          ? legacySubByTenant.get(branch.retailTenantId) || null
          : null);
      const meta = (sub?.metadata as any) || {};
      const workspace = workspaceStatusByBranch.get(branch.id) || {
        workspaceStatus: null,
        canStartRenewal: false,
        activationBlockers: [],
        isTrialWorkspace: false,
        trialEndsAt: null,
      };
      return {
        branchId: branch.id,
        branchName: branch.name,
        serviceFormat: (branch as any).serviceFormat ?? null,
        workspaceStatus: workspace.workspaceStatus,
        canStartRenewal: workspace.canStartRenewal,
        activationBlockers: workspace.activationBlockers,
        isTrialWorkspace: workspace.isTrialWorkspace,
        trialEndsAt: workspace.trialEndsAt,
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

  /** Platform admins operate any branch as its owner (see VendorPermissionGuard). */
  private isPlatformAdmin(roles: string[] = []): boolean {
    return (
      Array.isArray(roles) &&
      (roles.includes(UserRole.SUPER_ADMIN) || roles.includes(UserRole.ADMIN))
    );
  }

  private async loadBranchOrFail(branchId: number): Promise<Branch> {
    const branch = await this.branchesRepo.findOne({
      where: { id: branchId },
    });
    if (!branch) throw new NotFoundException(`Branch #${branchId} not found.`);
    return branch;
  }

  /**
   * Owner-only authority. Subscription money — payments, renewal, receipts —
   * belongs to whoever pays for the workspace, so it stays on this check.
   */
  async assertBranchOwnedBy(
    branchId: number,
    userId: number,
    roles: string[] = [],
  ): Promise<Branch> {
    const branch = await this.loadBranchOrFail(branchId);
    if (!this.isPlatformAdmin(roles) && branch.ownerId !== userId) {
      throw new ForbiddenException('You do not own this branch.');
    }
    return branch;
  }

  /**
   * Authority over a branch's OWN books and statements — expenses, fixed
   * assets, depreciation, accrued liabilities, debt, and the P&L / balance
   * sheet / trial balance.
   *
   * This is deliberately wider than `assertBranchOwnedBy`: it mirrors the
   * authority the POS portal already grants, which is owner **or manager**.
   * pos-s routes `/dashboard` (whose whole hero is `getBranchPL`) and
   * `/seller/financials` to owners AND branch managers — see `canAccessSurface`
   * in `src/app/shell/navigation.js`. Enforcing owner-only here left every
   * branch manager on a Dashboard that rendered no numbers and an expense form
   * that 403'd on submit.
   *
   * Tenant owners are included for the same reason `collectPosBranchAccessForUser`
   * grants them manager-equivalent access to their tenant's branches.
   *
   * `assignedSurfaces` is intentionally NOT consulted: it is a navigation
   * whitelist the owner uses to scope a manager's menu, enforced client-side
   * only, and no backend route has ever treated it as an authorization boundary.
   */
  async assertBranchAccountingAccess(
    branchId: number,
    userId: number,
    roles: string[] = [],
  ): Promise<Branch> {
    const branch = await this.loadBranchOrFail(branchId);
    if (this.isPlatformAdmin(roles) || branch.ownerId === userId) {
      return branch;
    }

    const [assignment, tenant] = await Promise.all([
      this.staffAssignmentsRepo.findOne({
        where: {
          branchId,
          userId,
          role: BranchStaffRole.MANAGER,
          isActive: true,
        },
      }),
      branch.retailTenantId
        ? this.retailTenantsRepo.findOne({
            where: { id: branch.retailTenantId },
          })
        : Promise.resolve(null),
    ]);

    // A tenant owner reaches a branch they own the tenant of — but not one that
    // has since been transferred to a different branch owner.
    const isTenantOwner =
      tenant?.ownerUserId === userId &&
      (branch.ownerId == null || branch.ownerId === userId);

    if (!assignment && !isTenantOwner) {
      throw new ForbiddenException(
        'You need branch owner or manager access to this branch to view its books.',
      );
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

  /**
   * Recorded expenses, newest first.
   *
   * Voided rows are left out unless asked for. Every caller that answers a money
   * question — the register's Today tab, the Daily P&L panel, the cash tile —
   * calls this without `includeVoided` and is therefore correct by default; only
   * the books panel, which has to SHOW what was voided and by whom, asks for
   * them.
   */
  async listBranchExpenses(
    branchId: number,
    range: { from?: Date; to?: Date; includeVoided?: boolean } = {},
  ) {
    const where: any = { branchId };
    if (range.from && range.to) {
      where.occurredAt = Between(range.from, range.to);
    }
    if (!range.includeVoided) {
      where.voidedAt = IsNull();
    }
    return this.expensesRepo.find({ where, order: { occurredAt: 'DESC' } });
  }

  /**
   * How far ahead an expense may be dated.
   *
   * Money that has not left yet is not an expense, and a row dated into next
   * month silently restates a period the owner has already been shown. A day of
   * slack absorbs a device clock that is out by a few hours and the fact that
   * the picker sends midnight UTC for a date chosen in EAT.
   */
  private static readonly MAX_FUTURE_DATING_MS = 24 * 60 * 60 * 1000;

  /**
   * How long a manager keeps the right to void their own entry.
   *
   * Deliberately a rolling window rather than "today", because `occurredAt` is a
   * naive timestamp and the picker sends midnight UTC — a calendar test would
   * flip three hours early for a branch in EAT. Past this, the void is the
   * owner's call.
   */
  private static readonly MANAGER_VOID_WINDOW_MS = 24 * 60 * 60 * 1000;

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
    const occurredAt = dto.occurredAt || new Date();
    if (
      occurredAt.getTime() >
      Date.now() + BranchBillingService.MAX_FUTURE_DATING_MS
    ) {
      throw new BadRequestException(
        'An expense cannot be dated in the future — record it on the day the money leaves.',
      );
    }
    const expense = this.expensesRepo.create({
      branchId,
      category: dto.category as any,
      amount: dto.amount,
      currency: dto.currency || 'ETB',
      occurredAt,
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
      memo: isLiabilitySettlementCategory(saved.category)
        ? 'Sales tax remitted to the authority'
        : `Expense — ${saved.category}`,
      debit: this.expenseDebitAccountFor(saved.category),
      credit: GlAccountCode.CASH,
      amount: Number(saved.amount),
    });
    return saved;
  }

  /**
   * Void an expense somebody recorded by hand.
   *
   * Replaces the old hard delete. The row stays, stamped with who voided it,
   * when and why; its ledger entry is reversed in the SAME transaction, so the
   * books can never be left with an expense the ledger has already backed out
   * (or the reverse). Three separate things had to be true before this was safe:
   *
   *  1. A reason is mandatory — the same bar `voidRun` sets for a purchase run.
   *  2. A row a payroll or purchase run posted cannot be voided from here at
   *     all. Voiding it by hand used to strand the run: `voidRun` flipped the
   *     run to VOID, then died on the missing expense before it ever reversed
   *     the stock, leaving the goods on the shelf as received with the money
   *     un-booked. See {@link assertExpenseWasHandRecorded}.
   *  3. Voiding somebody else's entry, or an old one, is the owner's call.
   *
   * @returns the voided row, so the caller can show what it just took out.
   */
  async voidBranchExpense(
    branchId: number,
    expenseId: number,
    actor: { userId: number; roles?: string[]; name?: string | null },
    reason: string,
  ): Promise<BranchExpense> {
    // Asserted here rather than in the controller (which is where every other
    // route on this service asserts) because the owner-only rule below needs the
    // branch this returns, and resolving it twice is a wasted query.
    const branch = await this.assertBranchAccountingAccess(
      branchId,
      actor.userId,
      actor.roles || [],
    );

    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) {
      throw new BadRequestException('A void has to say why.');
    }

    const expense = await this.expensesRepo.findOne({
      where: { id: expenseId, branchId },
    });
    if (!expense) {
      throw new NotFoundException(
        `Expense #${expenseId} not found for branch #${branchId}.`,
      );
    }
    if (expense.voidedAt) {
      throw new ConflictException('That expense was already voided.');
    }

    await this.assertExpenseWasHandRecorded(branchId, expenseId);
    this.assertMayVoidExpense(branch, expense, actor);

    const { expense: voided } = await this.applyExpenseVoid(expense, {
      userId: actor.userId,
      name: await this.resolveActorName(actor.userId, actor.name),
      reason: trimmedReason,
    });
    return voided;
  }

  /**
   * Correct a recorded expense.
   *
   * The reason people deleted expenses was almost never fraud — it was a typo,
   * and with no way to edit one, destroying the row was the only way to fix it.
   * That is what made deletion routine. This voids the wrong row and posts a
   * corrected one, leaving the pair visible: what was recorded, what it should
   * have said, and who changed it.
   *
   * Void first, then post. The other order would put two live rows in the books
   * if the void failed — the same money counted twice, which is the one outcome
   * worse than an unfixed typo. This order's failure mode is a voided row with
   * no replacement: visible in the panel, and re-recordable by hand.
   */
  async amendBranchExpense(
    branchId: number,
    expenseId: number,
    actor: { userId: number; roles?: string[]; name?: string | null },
    changes: {
      category?: string;
      amount?: number;
      occurredAt?: Date;
      note?: string | null;
      reason?: string;
    },
  ): Promise<BranchExpense> {
    const existing = await this.expensesRepo.findOne({
      where: { id: expenseId, branchId },
    });
    if (!existing) {
      throw new NotFoundException(
        `Expense #${expenseId} not found for branch #${branchId}.`,
      );
    }

    const stated = String(changes.reason || '').trim();
    await this.voidBranchExpense(
      branchId,
      expenseId,
      actor,
      stated ? `Corrected — ${stated}` : 'Corrected and re-recorded.',
    );

    const replacement = await this.createBranchExpense(branchId, actor.userId, {
      category: changes.category ?? existing.category,
      amount: changes.amount ?? Number(existing.amount),
      currency: existing.currency,
      occurredAt: changes.occurredAt ?? existing.occurredAt,
      note:
        changes.note === undefined
          ? (existing.note ?? undefined)
          : changes.note
            ? changes.note
            : undefined,
    });

    // Best-effort back-reference. The correction already stands without it; a
    // failed UPDATE here must not undo a void the ledger has acted on.
    try {
      await this.expensesRepo.update(
        { id: expenseId },
        {
          voidReason: `${
            stated ? `Corrected — ${stated}` : 'Corrected and re-recorded.'
          } Replaced by expense #${replacement.id}.`,
        },
      );
    } catch {
      // The pair is still legible from the timestamps and the reason.
    }

    return replacement;
  }

  /**
   * Void the expense a run posted, as part of undoing that run.
   *
   * Deliberately skips every guard `voidBranchExpense` applies: authority was
   * decided when the run was voided, and the machine-posted guard exists to stop
   * a HAND void from doing exactly this out of order. It also never throws on a
   * row that is missing or already voided — a run being undone must reach its
   * stock reversal whatever state the expense is in.
   */
  async voidBranchExpenseForRun(
    branchId: number,
    expenseId: number,
    reason: string,
    actor: { userId?: number | null; name?: string | null } = {},
  ): Promise<void> {
    const expense = await this.expensesRepo.findOne({
      where: { id: expenseId, branchId },
    });
    if (!expense || expense.voidedAt) return;
    await this.applyExpenseVoid(expense, {
      userId: actor.userId ?? null,
      name: await this.resolveActorName(actor.userId, actor.name),
      reason: String(reason || '').trim() || 'Reversed with its run.',
    });
  }

  /**
   * Refuse a hand void of a row a run owns.
   *
   * `expenseId` is the link in both directions: a payroll run and a purchase run
   * each hold the id of the single expense they posted, and undoing either one
   * goes through the run so the stock and the run status move with the money.
   */
  private async assertExpenseWasHandRecorded(
    branchId: number,
    expenseId: number,
  ): Promise<void> {
    const [payrollRun, purchaseRun] = await Promise.all([
      this.payrollRunsRepo.findOne({ where: { branchId, expenseId } }),
      this.purchaseRunsRepo.findOne({ where: { branchId, expenseId } }),
    ]);
    if (payrollRun) {
      throw new ConflictException(
        `This expense was posted by payroll run ${payrollRun.periodKey}. Delete that run instead — voiding it here would leave the run standing with no money behind it.`,
      );
    }
    if (purchaseRun) {
      throw new ConflictException(
        `This expense was posted by purchase run #${purchaseRun.id}. Void that run instead — voiding it here would leave the stock it brought in on the shelf.`,
      );
    }
  }

  /**
   * Who may void what.
   *
   * Recording an expense is owner-or-manager. Un-recording one is not the same
   * act: it removes a cost from a month somebody may already have been shown. A
   * manager keeps the obvious case — their own entry, caught the same day — and
   * everything else is the owner's, which is the shape a school fee refund
   * already has.
   */
  private assertMayVoidExpense(
    branch: Branch,
    expense: BranchExpense,
    actor: { userId: number; roles?: string[] },
  ): void {
    if (
      this.isPlatformAdmin(actor.roles || []) ||
      branch.ownerId === actor.userId
    ) {
      return;
    }
    if (expense.recordedByUserId !== actor.userId) {
      throw new ForbiddenException(
        'Only the branch owner can void an expense somebody else recorded.',
      );
    }
    const occurredAt = expense.occurredAt
      ? new Date(expense.occurredAt).getTime()
      : 0;
    const recordedAt = expense.createdAt
      ? new Date(expense.createdAt).getTime()
      : 0;
    // Whichever is more recent: an expense entered today for last week is still
    // a fresh mistake, and the person who just made it should be able to fix it.
    const freshest = Math.max(occurredAt, recordedAt);
    if (Date.now() - freshest > BranchBillingService.MANAGER_VOID_WINDOW_MS) {
      throw new ForbiddenException(
        'Only the branch owner can void an expense older than a day. Ask the owner to void it.',
      );
    }
  }

  /**
   * Mark the row voided and reverse its ledger entry, atomically.
   *
   * The UPDATE claims the void with `voidedAt IS NULL` in the WHERE, so a
   * double-tapped Void cannot reverse the ledger twice — the second one affects
   * no rows and returns what the first one wrote.
   */
  private async applyExpenseVoid(
    expense: BranchExpense,
    stamp: { userId: number | null; name: string | null; reason: string },
  ): Promise<{ expense: BranchExpense; alreadyVoided: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(BranchExpense);
      const voidedAt = new Date();
      const claim = await repo
        .createQueryBuilder()
        .update(BranchExpense)
        .set({
          voidedAt,
          voidedByUserId: stamp.userId ?? null,
          voidedByName: stamp.name ?? null,
          voidReason: stamp.reason,
        })
        .where('id = :id', { id: expense.id })
        .andWhere('"voidedAt" IS NULL')
        .execute();

      const fresh = await repo.findOne({ where: { id: expense.id } });
      if (!claim.affected) {
        return { expense: fresh || expense, alreadyVoided: true };
      }

      // Strict, unlike `reverseLedger`: this one runs inside the transaction
      // that hides the expense, so a failure here must take the void with it
      // rather than leaving the P&L and the ledger disagreeing in silence.
      const key = `expense-${expense.id}`;
      const entry = await this.generalLedger.findEntryByIdempotencyKey(
        expense.branchId,
        key,
        manager,
      );
      if (entry) {
        await this.generalLedger.reverse(
          entry.id,
          {
            sourceType: GlJournalSourceType.MANUAL,
            idempotencyKey: `reverse-${key}`,
            occurredAt: expense.occurredAt || voidedAt,
            memo: `Void of ${key}${
              stamp.name ? ` by ${stamp.name}` : ''
            } — ${stamp.reason}`,
            createdByUserId: stamp.userId ?? null,
          },
          manager,
        );
      }

      return { expense: fresh || expense, alreadyVoided: false };
    });
  }

  /** A stated name, else the user's display name. Worth a query, not a failure. */
  private async resolveActorName(
    userId?: number | null,
    stated?: string | null,
  ): Promise<string | null> {
    const given = String(stated || '').trim();
    if (given) return given.slice(0, 160);
    if (!userId) return null;
    try {
      const row = await this.usersRepo.findOne({
        where: { id: userId },
        select: ['id', 'displayName'],
      });
      const resolved = String(row?.displayName || '').trim();
      return resolved ? resolved.slice(0, 160) : null;
    } catch {
      return null;
    }
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
