import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchBillingService } from '../billing/branch-billing.service';
import { BranchExpenseCategory } from '../billing/entities/branch-expense.entity';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { StockMovementType } from '../branches/entities/stock-movement.entity';
import {
  PosCashMovement,
  PosCashMovementDirection,
  PosCashMovementReason,
} from './entities/pos-cash-movement.entity';
import { PurchaseRun, PurchaseRunStatus } from './entities/purchase-run.entity';
import { PurchaseRunLine } from './entities/purchase-run-line.entity';
import {
  CreatePurchaseRunDto,
  DecidePurchaseRunDto,
  IssuePurchaseAdvanceDto,
  ListCashMovementsQueryDto,
  ListPurchaseRunsQueryDto,
  PurchasePriceHistoryQueryDto,
  PurchaseRunLineDto,
  SubmitPurchaseRunDto,
  UpdatePurchaseRunDto,
} from './dto/purchasing.dto';

/** The source tag every cash movement and stock movement a run makes carries. */
export const PURCHASE_RUN_SOURCE = 'PURCHASE_RUN';

function money(value: unknown): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function qty(value: unknown): number {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

/** Who is asking, reduced to the two things this service needs to know. */
export interface PurchasingActor {
  userId: number | null;
  name: string | null;
  /** Owner, admin, branch manager, or an operator holding APPROVE_PURCHASE_RUN. */
  canApprove: boolean;
}

/**
 * The market run.
 *
 * Three rules carry the weight here:
 *
 *   1. A run is claimed by a CONDITIONAL UPDATE, never by read-then-write.
 *      Approval posts money and moves stock, and the phone it is tapped on is
 *      standing in a restaurant on a bad connection. `UPDATE … WHERE status =
 *      'SUBMITTED'` returning 0 rows is how a second tap learns it lost, which
 *      is the same job the unique index does for a payroll period.
 *
 *   2. Cash is recorded when it MOVES, not when it is approved. The advance
 *      leaves the drawer when it is handed over and the change comes back when
 *      the purchaser walks in — hours before any manager signs anything. A till
 *      that only learned about it at approval would be short all afternoon, and
 *      a short till is read as a thief, not as paperwork.
 *
 *   3. A purchaser sees their own runs and nobody else's. Matched on
 *      `purchaserUserId`, never on a name.
 */
@Injectable()
export class PurchasingService {
  private readonly logger = new Logger(PurchasingService.name);

  constructor(
    @InjectRepository(PurchaseRun)
    private readonly runs: Repository<PurchaseRun>,
    @InjectRepository(PurchaseRunLine)
    private readonly lines: Repository<PurchaseRunLine>,
    @InjectRepository(PosCashMovement)
    private readonly cashMovements: Repository<PosCashMovement>,
    private readonly billing: BranchBillingService,
    private readonly inventoryLedger: InventoryLedgerService,
  ) {}

  // ------------------------------------------------------------------ shaping

  private toLine(row: PurchaseRunLine) {
    return {
      id: Number(row.id),
      description: row.description,
      vendorName: row.vendorName ?? null,
      quantity: Number(row.quantity ?? 0),
      unitLabel: row.unitLabel ?? null,
      unitPrice: Number(row.unitPrice ?? 0),
      lineTotal: Number(row.lineTotal ?? 0),
      productId: row.productId ?? null,
      stockQuantity:
        row.stockQuantity == null ? null : Number(row.stockQuantity),
      stockMovementId: row.stockMovementId ?? null,
      note: row.note ?? null,
      sortOrder: row.sortOrder ?? 0,
    };
  }

  private toRun(row: PurchaseRun, lines: PurchaseRunLine[] = []) {
    const advance =
      row.advanceAmount == null ? null : Number(row.advanceAmount);
    const returned =
      row.returnedAmount == null ? null : Number(row.returnedAmount);
    const spent = Number(row.spentTotal ?? 0);
    return {
      id: Number(row.id),
      branchId: row.branchId,
      status: row.status,
      label: row.label ?? null,
      purchaserUserId: row.purchaserUserId ?? null,
      purchaserName: row.purchaserName ?? null,
      registerSessionId: row.registerSessionId ?? null,
      advanceAmount: advance,
      spentTotal: spent,
      returnedAmount: returned,
      /**
       * What is still unaccounted for. Positive means the purchaser is holding
       * money that has not come back; negative means the branch owes them.
       * Null when no advance was issued, because then there is nothing to
       * reconcile — it was never the branch's cash to begin with.
       */
      balance:
        advance == null ? null : money(advance - spent - (returned ?? 0)),
      currency: row.currency,
      occurredAt: row.occurredAt?.toISOString?.() ?? null,
      submittedAt: row.submittedAt?.toISOString?.() ?? null,
      decidedAt: row.decidedAt?.toISOString?.() ?? null,
      decidedByUserId: row.decidedByUserId ?? null,
      decidedByName: row.decidedByName ?? null,
      decisionReason: row.decisionReason ?? null,
      expenseId: row.expenseId ?? null,
      note: row.note ?? null,
      lineCount: lines.length,
      lines: lines
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((line) => this.toLine(line)),
      createdAt: row.createdAt?.toISOString?.() ?? null,
      updatedAt: row.updatedAt?.toISOString?.() ?? null,
    };
  }

  private parseDate(value: string | undefined | null, field: string): Date {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} could not be read as a date.`);
    }
    return date;
  }

  /**
   * A line's total, from whichever of the two the caller actually sent.
   *
   * quantity × unitPrice is the arithmetic, but a market price is as often
   * agreed on the whole lot — "three hundred for those" — and recomputing that
   * from a per-kilo rate loses the birr the two differ by. An explicit total
   * always wins.
   */
  private lineTotalOf(dto: PurchaseRunLineDto): number {
    if (dto.lineTotal != null) return money(dto.lineTotal);
    return money((Number(dto.quantity) || 0) * (Number(dto.unitPrice) || 0));
  }

  private buildLines(
    run: PurchaseRun,
    dtos: PurchaseRunLineDto[],
  ): PurchaseRunLine[] {
    return dtos.map((dto, index) =>
      this.lines.create({
        runId: run.id,
        branchId: run.branchId,
        description: String(dto.description || '').trim(),
        vendorName: dto.vendorName ? String(dto.vendorName).trim() : null,
        quantity: qty(dto.quantity ?? 1),
        unitLabel: dto.unitLabel ? String(dto.unitLabel).trim() : null,
        unitPrice: money(dto.unitPrice ?? 0),
        lineTotal: this.lineTotalOf(dto),
        productId: dto.productId ?? null,
        // A stock quantity with no product to add it to is meaningless, and a
        // product with no quantity adds nothing — drop both rather than store a
        // half-link that a later approval would have to guess about.
        stockQuantity:
          dto.productId && dto.stockQuantity ? qty(dto.stockQuantity) : null,
        note: dto.note ? String(dto.note).trim() : null,
        sortOrder: index,
      }),
    );
  }

  private async loadLines(runId: number): Promise<PurchaseRunLine[]> {
    return this.lines.find({
      where: { runId },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  private async loadRunOrFail(
    id: number,
    branchId: number,
  ): Promise<PurchaseRun> {
    const run = await this.runs.findOne({ where: { id, branchId } });
    if (!run) throw new NotFoundException('That purchase run was not found.');
    return run;
  }

  /**
   * A purchaser may only touch their own run. A manager may touch any of them.
   *
   * Matched on the user id rather than the name, for the reason the QSR waiter
   * order list is: two people called Maxamed on one roster is not a rare case
   * here, it is Tuesday.
   */
  private assertMayEdit(run: PurchaseRun, actor: PurchasingActor) {
    if (actor.canApprove) return;
    if (
      run.purchaserUserId != null &&
      Number(run.purchaserUserId) === Number(actor.userId)
    ) {
      return;
    }
    throw new NotFoundException('That purchase run was not found.');
  }

  private async recalcTotal(run: PurchaseRun): Promise<PurchaseRun> {
    const lines = await this.loadLines(run.id);
    run.spentTotal = money(
      lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0),
    );
    return this.runs.save(run);
  }

  // -------------------------------------------------------------------- reads

  async listRuns(query: ListPurchaseRunsQueryDto, actor: PurchasingActor) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const qb = this.runs
      .createQueryBuilder('run')
      .where('run."branchId" = :branchId', { branchId: query.branchId });

    const status = String(query.status || '')
      .trim()
      .toUpperCase();
    if (status) {
      const wanted = status
        .split(',')
        .map((part) => part.trim())
        .filter((part) =>
          Object.values(PurchaseRunStatus).includes(part as PurchaseRunStatus),
        );
      if (wanted.length) {
        qb.andWhere('run.status IN (:...wanted)', { wanted });
      }
    }

    if (query.from) {
      qb.andWhere('run."occurredAt" >= :from', {
        from: this.parseDate(query.from, 'from'),
      });
    }
    if (query.to) {
      qb.andWhere('run."occurredAt" <= :to', {
        to: this.parseDate(query.to, 'to'),
      });
    }

    // The purchaser's own runs and nobody else's. What one person paid for meat
    // is not the whole roster's business, and the board this feeds is the one
    // they work from all morning.
    if (!actor.canApprove) {
      if (!actor.userId) return { items: [], total: 0 };
      qb.andWhere('run."purchaserUserId" = :userId', { userId: actor.userId });
    }

    const rows = await qb
      .orderBy('run."occurredAt"', 'DESC')
      .addOrderBy('run.id', 'DESC')
      .take(limit)
      .getMany();

    if (!rows.length) return { items: [], total: 0 };

    const linesByRun = new Map<number, PurchaseRunLine[]>();
    const allLines = await this.lines.find({
      where: rows.map((row) => ({ runId: row.id })),
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    for (const line of allLines) {
      const list = linesByRun.get(line.runId) ?? [];
      list.push(line);
      linesByRun.set(line.runId, list);
    }

    return {
      items: rows.map((row) => this.toRun(row, linesByRun.get(row.id) ?? [])),
      total: rows.length,
    };
  }

  async getRun(id: number, branchId: number, actor: PurchasingActor) {
    const run = await this.loadRunOrFail(id, branchId);
    this.assertMayEdit(run, actor);
    return this.toRun(run, await this.loadLines(run.id));
  }

  /**
   * What this branch has paid for a thing, over time.
   *
   * The reason the lines are kept at all. A purchaser who can see that onions
   * were 45 last week and are 70 today has an argument to make at the stall,
   * and an owner who can see it has a question to ask.
   */
  async priceHistory(query: PurchasePriceHistoryQueryDto) {
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const qb = this.lines
      .createQueryBuilder('line')
      .innerJoin(PurchaseRun, 'run', 'run.id = line."runId"')
      .where('line."branchId" = :branchId', { branchId: query.branchId })
      // Draft and rejected runs are not evidence of a price — nobody has
      // stood behind them.
      .andWhere('run.status IN (:...statuses)', {
        statuses: [PurchaseRunStatus.SUBMITTED, PurchaseRunStatus.APPROVED],
      })
      .select('LOWER(line.description)', 'key')
      .addSelect('MAX(line.description)', 'description')
      .addSelect('MAX(line."unitLabel")', 'unitLabel')
      .addSelect('COUNT(*)', 'timesBought')
      /* Every one of these derives the unit price as total ÷ quantity rather
         than reading the `unitPrice` column, because that column is optional by
         design: a price agreed on the whole lot — "three hundred for those" —
         is typed as a total with no per-unit rate behind it. Reading the column
         reported charcoal at "between 0 and 0" while the average said 350,
         which is not a range anybody paid. */
      .addSelect(
        'MIN(line."lineTotal" / NULLIF(line.quantity, 0))',
        'minUnitPrice',
      )
      .addSelect(
        'MAX(line."lineTotal" / NULLIF(line.quantity, 0))',
        'maxUnitPrice',
      )
      .addSelect('MAX(run."occurredAt")', 'lastBoughtAt')
      .addSelect(
        'SUM(line."lineTotal") / NULLIF(SUM(line.quantity), 0)',
        'avgUnitPrice',
      )
      /* What it cost the LAST time, which is the number a purchaser standing at
         a stall is actually arguing with. An average is a number nobody paid:
         tomatoes at 45 then 70 average to 57.50, and quoting that back to the
         seller is quoting a price that never existed. */
      .addSelect(
        `(array_agg(line."lineTotal" / NULLIF(line.quantity, 0)
           ORDER BY run."occurredAt" DESC, line.id DESC))[1]`,
        'lastUnitPrice',
      )
      .groupBy('LOWER(line.description)');

    if (query.q) {
      qb.andWhere('line.description ILIKE :q', { q: `%${query.q}%` });
    }

    const rows = await qb
      .orderBy('MAX(run."occurredAt")', 'DESC')
      .limit(limit)
      .getRawMany();

    return {
      items: rows.map((row: Record<string, unknown>) => ({
        description: String(row.description ?? ''),
        unitLabel: (row.unitLabel as string) ?? null,
        timesBought: Number(row.timesBought) || 0,
        minUnitPrice: money(row.minUnitPrice),
        maxUnitPrice: money(row.maxUnitPrice),
        avgUnitPrice: money(row.avgUnitPrice),
        lastUnitPrice: money(row.lastUnitPrice),
        lastBoughtAt: row.lastBoughtAt
          ? new Date(row.lastBoughtAt as string).toISOString()
          : null,
      })),
    };
  }

  async listCashMovements(query: ListCashMovementsQueryDto) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const where: Record<string, unknown> = { branchId: query.branchId };
    if (query.registerSessionId) {
      where.registerSessionId = query.registerSessionId;
    }
    const rows = await this.cashMovements.find({
      where,
      order: { occurredAt: 'DESC', id: 'DESC' },
      take: limit,
    });

    let paidIn = 0;
    let paidOut = 0;
    for (const row of rows) {
      const amount = Number(row.amount) || 0;
      if (row.direction === PosCashMovementDirection.IN) paidIn += amount;
      else paidOut += amount;
    }

    return {
      items: rows.map((row) => ({
        id: Number(row.id),
        branchId: row.branchId,
        registerSessionId: row.registerSessionId ?? null,
        direction: row.direction,
        amount: Number(row.amount),
        currency: row.currency,
        reason: row.reason,
        sourceType: row.sourceType ?? null,
        sourceId: row.sourceId ?? null,
        recordedByUserId: row.recordedByUserId ?? null,
        recordedByName: row.recordedByName ?? null,
        occurredAt: row.occurredAt?.toISOString?.() ?? null,
        note: row.note ?? null,
      })),
      paidIn: money(paidIn),
      paidOut: money(paidOut),
      /** What these movements do to the drawer. Negative = cash went out. */
      net: money(paidIn - paidOut),
    };
  }

  // ------------------------------------------------------------------- writes

  async createRun(dto: CreatePurchaseRunDto, actor: PurchasingActor) {
    const occurredAt = this.parseDate(dto.occurredAt, 'occurredAt');
    const run = await this.runs.save(
      this.runs.create({
        branchId: dto.branchId,
        status: PurchaseRunStatus.DRAFT,
        label: dto.label ? String(dto.label).trim() : null,
        purchaserUserId: actor.userId ?? null,
        purchaserName: actor.name ?? null,
        currency: (dto.currency || 'ETB').toUpperCase().slice(0, 8),
        occurredAt,
        spentTotal: 0,
        note: dto.note ? String(dto.note).trim() : null,
      }),
    );

    if (dto.lines?.length) {
      await this.lines.save(this.buildLines(run, dto.lines));
    }

    const saved = await this.recalcTotal(run);
    return this.toRun(saved, await this.loadLines(saved.id));
  }

  async updateRun(
    id: number,
    dto: UpdatePurchaseRunDto,
    actor: PurchasingActor,
  ) {
    const run = await this.loadRunOrFail(id, dto.branchId);
    this.assertMayEdit(run, actor);

    if (
      run.status !== PurchaseRunStatus.DRAFT &&
      run.status !== PurchaseRunStatus.REJECTED
    ) {
      throw new ConflictException(
        run.status === PurchaseRunStatus.SUBMITTED
          ? 'This run has been filed and is waiting to be signed off. Ask a manager to send it back if it needs changing.'
          : 'A run that has been signed off can no longer be edited.',
      );
    }

    if (dto.label !== undefined) {
      run.label = dto.label ? String(dto.label).trim() : null;
    }
    if (dto.note !== undefined) {
      run.note = dto.note ? String(dto.note).trim() : null;
    }
    if (dto.occurredAt) {
      run.occurredAt = this.parseDate(dto.occurredAt, 'occurredAt');
    }

    if (dto.lines) {
      // Replace the set. See UpdatePurchaseRunDto — a partial line patch would
      // need stable ids for rows still being typed on a phone in a market.
      await this.lines.delete({ runId: run.id });
      if (dto.lines.length) {
        await this.lines.save(this.buildLines(run, dto.lines));
      }
    }

    const saved = await this.recalcTotal(run);
    return this.toRun(saved, await this.loadLines(saved.id));
  }

  async deleteRun(id: number, branchId: number, actor: PurchasingActor) {
    const run = await this.loadRunOrFail(id, branchId);
    this.assertMayEdit(run, actor);
    if (
      run.status === PurchaseRunStatus.APPROVED ||
      run.status === PurchaseRunStatus.VOID
    ) {
      throw new ConflictException(
        'A run that reached the books cannot be deleted. Void it instead, so the reversal is recorded.',
      );
    }
    await this.runs.delete({ id: run.id, branchId });
    return { deleted: true, id: Number(run.id) };
  }

  /**
   * File the run, and take the change back into the drawer.
   *
   * The change is recorded HERE rather than at approval because this is when it
   * physically happens — the purchaser walks in and hands it over. Waiting for a
   * signature would leave the till reporting a shortfall for as long as the
   * manager took to look at it.
   */
  async submitRun(
    id: number,
    dto: SubmitPurchaseRunDto,
    actor: PurchasingActor,
  ) {
    const run = await this.loadRunOrFail(id, dto.branchId);
    this.assertMayEdit(run, actor);

    if (
      run.status !== PurchaseRunStatus.DRAFT &&
      run.status !== PurchaseRunStatus.REJECTED
    ) {
      throw new ConflictException('This run has already been filed.');
    }

    const lines = await this.loadLines(run.id);
    if (!lines.length) {
      throw new BadRequestException(
        'A run needs at least one thing bought on it before it can be filed.',
      );
    }

    run.spentTotal = money(
      lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0),
    );
    if (run.spentTotal <= 0) {
      throw new BadRequestException(
        'Every line on this run costs nothing. Add the prices before filing it.',
      );
    }

    if (dto.returnedAmount != null) {
      run.returnedAmount = money(dto.returnedAmount);
    }
    run.status = PurchaseRunStatus.SUBMITTED;
    run.submittedAt = new Date();
    // A rejection that is being answered is no longer the run's current state.
    run.decisionReason = null;
    const saved = await this.runs.save(run);

    if (saved.returnedAmount != null && saved.returnedAmount > 0) {
      await this.recordChangeReturn(saved, actor);
    }

    return this.toRun(saved, lines);
  }

  /**
   * Money back into the drawer, once.
   *
   * A rejected run comes back as an editable draft and is filed again; without
   * this guard the second filing would tell the till the change came back
   * twice, and a drawer that is over is a discrepancy exactly like one that is
   * short.
   */
  private async recordChangeReturn(run: PurchaseRun, actor: PurchasingActor) {
    const existing = await this.cashMovements.findOne({
      where: {
        sourceType: PURCHASE_RUN_SOURCE,
        sourceId: run.id,
        reason: PosCashMovementReason.PURCHASE_CHANGE_RETURN,
      },
    });
    if (existing) return existing;

    return this.cashMovements.save(
      this.cashMovements.create({
        branchId: run.branchId,
        registerSessionId: run.registerSessionId ?? null,
        direction: PosCashMovementDirection.IN,
        amount: money(run.returnedAmount),
        currency: run.currency,
        reason: PosCashMovementReason.PURCHASE_CHANGE_RETURN,
        sourceType: PURCHASE_RUN_SOURCE,
        sourceId: run.id,
        recordedByUserId: actor.userId ?? null,
        recordedByName: actor.name ?? null,
        occurredAt: new Date(),
        note: `Change returned from run #${run.id}`,
      }),
    );
  }

  /**
   * Hand cash out of the till against a run.
   *
   * The second and later issues are recorded as a TOP_UP rather than another
   * advance: the price of meat moves between the ask and the market, and the
   * difference between "we planned to spend this" and "we had to find more" is
   * exactly what an owner reading the day back wants to see.
   */
  async issueAdvance(
    id: number,
    dto: IssuePurchaseAdvanceDto,
    actor: PurchasingActor,
  ) {
    const run = await this.loadRunOrFail(id, dto.branchId);

    if (
      run.status === PurchaseRunStatus.APPROVED ||
      run.status === PurchaseRunStatus.VOID
    ) {
      throw new ConflictException(
        'This run is closed. Cash cannot be issued against it.',
      );
    }

    const amount = money(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('An advance has to be more than zero.');
    }

    const isTopUp = run.advanceAmount != null && Number(run.advanceAmount) > 0;

    if (dto.registerSessionId) {
      run.registerSessionId = dto.registerSessionId;
    }
    run.advanceAmount = money(Number(run.advanceAmount || 0) + amount);
    const saved = await this.runs.save(run);

    await this.cashMovements.save(
      this.cashMovements.create({
        branchId: saved.branchId,
        registerSessionId:
          dto.registerSessionId ?? saved.registerSessionId ?? null,
        direction: PosCashMovementDirection.OUT,
        amount,
        currency: saved.currency,
        reason: isTopUp
          ? PosCashMovementReason.PURCHASE_TOP_UP
          : PosCashMovementReason.PURCHASE_ADVANCE,
        sourceType: PURCHASE_RUN_SOURCE,
        sourceId: saved.id,
        recordedByUserId: actor.userId ?? null,
        recordedByName: actor.name ?? null,
        occurredAt: new Date(),
        note:
          dto.note ||
          `${isTopUp ? 'Top-up' : 'Advance'} for run #${saved.id}${
            saved.purchaserName ? ` — ${saved.purchaserName}` : ''
          }`,
      }),
    );

    return this.toRun(saved, await this.loadLines(saved.id));
  }

  /**
   * Sign the run off. This is what posts it.
   *
   * Claimed with a conditional UPDATE rather than a read-then-write: a second
   * tap on a slow phone must LOSE, not post a second expense. If the expense
   * cannot be written the claim is released, so the run stays signable rather
   * than becoming a document nobody can act on.
   */
  async approveRun(
    id: number,
    dto: DecidePurchaseRunDto,
    actor: PurchasingActor,
  ) {
    const run = await this.loadRunOrFail(id, dto.branchId);

    // Already done. Return it rather than throwing — the caller tapped twice,
    // and the second tap should show them the signed run, not an error.
    if (run.status === PurchaseRunStatus.APPROVED && run.expenseId != null) {
      return this.toRun(run, await this.loadLines(run.id));
    }
    if (run.status !== PurchaseRunStatus.SUBMITTED) {
      throw new ConflictException(
        'Only a filed run can be signed off. This one is ' +
          `${String(run.status).toLowerCase()}.`,
      );
    }

    const lines = await this.loadLines(run.id);
    if (!lines.length) {
      throw new BadRequestException('This run has nothing on it.');
    }

    const decidedAt = new Date();
    const claim = await this.runs
      .createQueryBuilder()
      .update(PurchaseRun)
      .set({
        status: PurchaseRunStatus.APPROVED,
        decidedAt,
        decidedByUserId: actor.userId ?? null,
        decidedByName: actor.name ?? null,
        decisionReason: dto.reason ? String(dto.reason).trim() : null,
      })
      .where('id = :id', { id: run.id })
      .andWhere('"branchId" = :branchId', { branchId: dto.branchId })
      .andWhere('status = :status', { status: PurchaseRunStatus.SUBMITTED })
      .execute();

    if (!claim.affected) {
      throw new ConflictException(
        'Somebody else signed this run off a moment ago.',
      );
    }

    let expenseId: number | null = null;
    try {
      const expense = await this.billing.createBranchExpense(
        run.branchId,
        actor.userId ?? 0,
        {
          category: BranchExpenseCategory.INGREDIENTS,
          amount: money(run.spentTotal),
          currency: run.currency,
          occurredAt: run.occurredAt,
          note: `Purchase run #${run.id}${run.label ? ` — ${run.label}` : ''}${
            run.purchaserName ? ` (${run.purchaserName})` : ''
          }`,
        },
      );
      expenseId = Number(expense.id);
      await this.runs.update({ id: run.id }, { expenseId });
    } catch (error) {
      // Nothing posted, so the signature must not stand.
      await this.runs.update(
        { id: run.id },
        {
          status: PurchaseRunStatus.SUBMITTED,
          decidedAt: null,
          decidedByUserId: null,
          decidedByName: null,
        },
      );
      throw error;
    }

    await this.applyStockLines(run, lines, actor);

    const fresh = await this.loadRunOrFail(run.id, dto.branchId);
    return this.toRun(fresh, await this.loadLines(run.id));
  }

  /**
   * Raise stock for every line that named a product.
   *
   * Deliberately best-effort and per-line. The money is already posted and the
   * goods are already in the kitchen; a product that has since been deleted from
   * the catalog must not turn an approved run into a failed request the manager
   * will simply tap again. Each line records the movement it made, so a retry
   * cannot double it.
   */
  private async applyStockLines(
    run: PurchaseRun,
    lines: PurchaseRunLine[],
    actor: PurchasingActor,
  ) {
    for (const line of lines) {
      if (!line.productId || !line.stockQuantity || line.stockMovementId) {
        continue;
      }
      try {
        const { movement } = await this.inventoryLedger.recordMovement({
          branchId: run.branchId,
          productId: Number(line.productId),
          movementType: StockMovementType.PURCHASE_RECEIPT,
          quantityDelta: Number(line.stockQuantity),
          sourceType: PURCHASE_RUN_SOURCE,
          sourceReferenceId: run.id,
          actorUserId: actor.userId ?? null,
          occurredAt: run.occurredAt,
          note: `Purchase run #${run.id} — ${line.description}`,
        });
        await this.lines.update(
          { id: line.id },
          { stockMovementId: Number(movement.id) },
        );
      } catch (error) {
        this.logger.warn(
          `Purchase run #${run.id} line ${line.id} could not raise stock for product ${line.productId}: ${
            (error as Error)?.message ?? error
          }`,
        );
      }
    }
  }

  /** Send it back, with a reason. The run returns to the purchaser editable. */
  async rejectRun(
    id: number,
    dto: DecidePurchaseRunDto,
    actor: PurchasingActor,
  ) {
    const run = await this.loadRunOrFail(id, dto.branchId);
    if (run.status !== PurchaseRunStatus.SUBMITTED) {
      throw new ConflictException('Only a filed run can be sent back.');
    }
    const reason = String(dto.reason || '').trim();
    if (!reason) {
      throw new BadRequestException(
        'Say why it is going back — the purchaser has to know what to change.',
      );
    }

    run.status = PurchaseRunStatus.REJECTED;
    run.decidedAt = new Date();
    run.decidedByUserId = actor.userId ?? null;
    run.decidedByName = actor.name ?? null;
    run.decisionReason = reason;
    const saved = await this.runs.save(run);
    return this.toRun(saved, await this.loadLines(saved.id));
  }

  /**
   * Reverse a signed run.
   *
   * The expense goes (which reverses its own ledger entry) and the stock comes
   * back out. The CASH does not: the advance really was handed over and the
   * change really did come back, and un-recording those would leave the drawer
   * describing a day that did not happen. A void reverses the document, not the
   * afternoon.
   */
  async voidRun(id: number, dto: DecidePurchaseRunDto, actor: PurchasingActor) {
    const run = await this.loadRunOrFail(id, dto.branchId);
    if (run.status !== PurchaseRunStatus.APPROVED) {
      throw new ConflictException('Only a signed-off run can be voided.');
    }
    const reason = String(dto.reason || '').trim();
    if (!reason) {
      throw new BadRequestException('A void has to say why.');
    }

    const claim = await this.runs
      .createQueryBuilder()
      .update(PurchaseRun)
      .set({
        status: PurchaseRunStatus.VOID,
        decidedAt: new Date(),
        decidedByUserId: actor.userId ?? null,
        decidedByName: actor.name ?? null,
        decisionReason: reason,
      })
      .where('id = :id', { id: run.id })
      .andWhere('"branchId" = :branchId', { branchId: dto.branchId })
      .andWhere('status = :status', { status: PurchaseRunStatus.APPROVED })
      .execute();

    if (!claim.affected) {
      throw new ConflictException('That run was already voided.');
    }

    if (run.expenseId != null) {
      await this.billing.deleteBranchExpense(
        run.branchId,
        Number(run.expenseId),
      );
      await this.runs.update({ id: run.id }, { expenseId: null });
    }

    const lines = await this.loadLines(run.id);
    for (const line of lines) {
      if (!line.stockMovementId || !line.productId || !line.stockQuantity) {
        continue;
      }
      try {
        await this.inventoryLedger.recordMovement({
          branchId: run.branchId,
          productId: Number(line.productId),
          movementType: StockMovementType.PURCHASE_RECEIPT,
          quantityDelta: -Number(line.stockQuantity),
          sourceType: PURCHASE_RUN_SOURCE,
          sourceReferenceId: run.id,
          actorUserId: actor.userId ?? null,
          note: `Void of purchase run #${run.id} — ${line.description}`,
        });
        await this.lines.update({ id: line.id }, { stockMovementId: null });
      } catch (error) {
        this.logger.warn(
          `Purchase run #${run.id} line ${line.id} could not reverse stock: ${
            (error as Error)?.message ?? error
          }`,
        );
      }
    }

    const fresh = await this.loadRunOrFail(run.id, dto.branchId);
    return this.toRun(fresh, await this.loadLines(run.id));
  }
}
