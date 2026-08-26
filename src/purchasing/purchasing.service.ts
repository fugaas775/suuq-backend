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
import {
  BranchExpense,
  BranchExpenseCategory,
} from '../billing/entities/branch-expense.entity';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { User } from '../users/entities/user.entity';
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

/**
 * The opening of the note every approved run posts, and the only handle there
 * is on "has this run already been posted?".
 *
 * Deterministic and defined once, because it is read back as an idempotency key
 * — see findPostedExpense. Changing the shape of this string breaks the ability
 * to recognise an expense a previous attempt already wrote.
 */
export function purchaseRunExpenseNote(runId: number): string {
  return `Purchase run #${runId}`;
}

/** Postgres unique-violation, however the driver wrapped it. */
function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return String(code) === '23505';
}

/** Still standing. Every total, every rate and every stock move asks this. */
function isLive(line: PurchaseRunLine): boolean {
  return line?.voidedAt == null;
}

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
    @InjectRepository(User)
    private readonly users: Repository<User>,
    // Read-only, and only to answer "did this run already post one?" — see
    // findPostedExpense. Everything that WRITES an expense goes through billing.
    @InjectRepository(BranchExpense)
    private readonly expenses: Repository<BranchExpense>,
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
      voidedAt: row.voidedAt?.toISOString?.() ?? null,
      voidedByName: row.voidedByName ?? null,
      voidReason: row.voidReason ?? null,
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
      clientRef: row.clientRef ?? null,
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
      // What is still standing. A struck line stays on the document but is not
      // part of what the run bought.
      lineCount: lines.filter(isLive).length,
      lines: lines
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((line) => this.toLine(line)),
      createdAt: row.createdAt?.toISOString?.() ?? null,
      updatedAt: row.updatedAt?.toISOString?.() ?? null,
    };
  }

  /**
   * The name to write on the document.
   *
   * A POS-scoped token states `email` and no `displayName`, and a manual staff
   * account's email is synthetic — `pos.m.purchaser.qsr@sys.internal`. Printing
   * that as the purchaser turns a record an owner reads for months into a
   * machine address; SMAK QSR's board showed exactly that. So a synthetic
   * address falls back to the roster, which is where the human name lives.
   *
   * One lookup, only when the token could not answer.
   */
  private async actorName(actor: PurchasingActor): Promise<string | null> {
    const stated = String(actor.name || '').trim();
    if (stated && !stated.toLowerCase().endsWith('@sys.internal')) {
      return stated;
    }
    if (!actor.userId) return stated || null;
    try {
      const row = await this.users.findOne({
        where: { id: actor.userId },
        select: ['id', 'displayName'],
      });
      const resolved = String(row?.displayName || '').trim();
      return resolved || stated || null;
    } catch {
      // A name is worth a query, not a failed request.
      return stated || null;
    }
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
        /* NOT defaulted to 1.
           A rate is derived as total ÷ quantity, so assuming one meant every
           bare total became a per-unit price: "1450" typed for four sacks of
           charcoal taught the price book that charcoal costs 1450 each, and
           the purchaser then read that back at a stall as what they last paid.
           No stated quantity means no rate — which the price-history query
           already handles, because NULLIF(0) excludes it. */
        quantity: qty(dto.quantity ?? 0),
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
    run.spentTotal = this.liveTotal(lines);
    return this.runs.save(run);
  }

  /** What the run comes to, ignoring anything a manager has struck off. */
  private liveTotal(lines: PurchaseRunLine[]): number {
    return money(
      (lines || [])
        .filter(isLive)
        .reduce((sum, line) => sum + Number(line.lineTotal || 0), 0),
    );
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
    return {
      ...this.toRun(run, await this.loadLines(run.id)),
      cash: await this.reconcileCash(run),
    };
  }

  /**
   * What the run says about its cash, against what the drawer says.
   *
   * These are written by two statements that cannot be one, and the order was
   * chosen deliberately: the drawer row goes first, so an interruption leaves a
   * till that knows money left and a run that does not. That is the survivable
   * direction — but only if somebody can SEE it. An advance the run never
   * recorded is money out with no paperwork, which is exactly the shape this
   * whole feature exists to stop being invisible.
   *
   * Read on the single-run view rather than the list: it is one query, and the
   * question is asked about a run somebody is already looking at.
   */
  private async reconcileCash(run: PurchaseRun) {
    const rows = await this.cashMovements.find({
      where: { sourceType: PURCHASE_RUN_SOURCE, sourceId: run.id },
      select: ['direction', 'amount'],
    });

    let out = 0;
    let back = 0;
    for (const row of rows) {
      const amount = Number(row.amount) || 0;
      if (row.direction === PosCashMovementDirection.OUT) out += amount;
      else back += amount;
    }

    const statedOut = money(Number(run.advanceAmount || 0));
    const statedBack = money(Number(run.returnedAmount || 0));
    const drawerOut = money(out);
    const drawerBack = money(back);

    return {
      drawerPaidOut: drawerOut,
      drawerPaidIn: drawerBack,
      /**
       * True when the document and the till disagree. Never expected — every
       * write that moves cash is now atomic — and worth answering anyway,
       * because the failure it catches is money leaving a drawer with nothing
       * on the board to account for it.
       */
      mismatch:
        Math.abs(statedOut - drawerOut) >= 0.01 ||
        Math.abs(statedBack - drawerBack) >= 0.01,
    };
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
      // A struck line is not evidence of a price. Somebody looked at it and
      // said the branch did not buy that.
      .andWhere('line."voidedAt" IS NULL')
      /* Nor is a line nobody priced. A purchaser walking a market writes the
         name and gets the price when the seller says it; one that never got a
         price would otherwise enter the book at a rate of zero and drag every
         average it appears in down with it. */
      .andWhere('line."lineTotal" > 0')
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

  /**
   * Start a run.
   *
   * Idempotent on `clientRef`, because this is a POST from a phone standing in a
   * market: the write lands, the response does not come back, and the purchaser
   * taps again. Without a ref that is a second run for one trip, and two
   * expenses once both are signed off.
   *
   * The ref is checked first and the unique index catches the race the check
   * cannot — two taps close enough together that both read an empty table. Both
   * paths end the same way: return the run that exists.
   */
  async createRun(dto: CreatePurchaseRunDto, actor: PurchasingActor) {
    const clientRef =
      String(dto.clientRef || '')
        .trim()
        .slice(0, 64) || null;

    if (clientRef) {
      const existing = await this.runs.findOne({
        where: { branchId: dto.branchId, clientRef },
      });
      if (existing) {
        return this.toRun(existing, await this.loadLines(existing.id));
      }
    }

    const occurredAt = this.parseDate(dto.occurredAt, 'occurredAt');
    let run: PurchaseRun;
    try {
      run = await this.runs.save(
        this.runs.create({
          branchId: dto.branchId,
          status: PurchaseRunStatus.DRAFT,
          label: dto.label ? String(dto.label).trim() : null,
          clientRef,
          purchaserUserId: actor.userId ?? null,
          purchaserName: await this.actorName(actor),
          currency: (dto.currency || 'ETB').toUpperCase().slice(0, 8),
          occurredAt,
          spentTotal: 0,
          note: dto.note ? String(dto.note).trim() : null,
        }),
      );
    } catch (error) {
      // Lost the race to an identical retry. The index is the real guard; the
      // lookup above only saves the common case a round trip.
      if (clientRef && isUniqueViolation(error)) {
        const raced = await this.runs.findOne({
          where: { branchId: dto.branchId, clientRef },
        });
        if (raced) return this.toRun(raced, await this.loadLines(raced.id));
      }
      throw error;
    }

    // Only re-save when there is something to total. An empty new run is
    // already zero, and a second write is a second thing to fail on a market
    // connection.
    if (!dto.lines?.length) {
      return this.toRun(run, []);
    }

    await this.lines.save(this.buildLines(run, dto.lines));
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
      /* Replace the set, in ONE transaction. See UpdatePurchaseRunDto — a
         partial line patch would need stable ids for rows still being typed on
         a phone in a market.

         The delete and the insert used to be two statements, so a connection
         dropped between them left a run with no lines at all and a spentTotal
         that still claimed a number. Twelve lines typed at a stall, gone, and
         the run reading as if they had never been written. */
      const replacements = dto.lines.length
        ? this.buildLines(run, dto.lines)
        : [];
      await this.lines.manager.transaction(async (manager) => {
        await manager.delete(PurchaseRunLine, { runId: run.id });
        if (replacements.length) {
          await manager.save(PurchaseRunLine, replacements);
        }
      });
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

    /* A draft that money has already moved against is not a note somebody can
       tear up.
       
       Deleting one used to leave its drawer rows behind, pointing at a run that
       no longer existed — so the till stayed short by the advance with nothing
       on the board to explain it, which is the exact shape of a discrepancy
       that gets read as theft. Found on SMAK QSR: a deleted run left ETB 1,000
       out and ETB 100 back, still moving session 533's expected cash.
       
       Refused rather than reversed, because a reversal here would be a claim
       that the cash came back, and this service has no way to know that. The
       way out is to record what the money bought, or to have a manager sign the
       run off and void it — both of which leave a document behind. */
    const cashMoved = await this.cashMovements.count({
      where: { sourceType: PURCHASE_RUN_SOURCE, sourceId: run.id },
    });
    if (cashMoved > 0) {
      const outstanding = money(
        Number(run.advanceAmount || 0) - Number(run.returnedAmount || 0),
      );
      throw new ConflictException(
        outstanding > 0
          ? `${outstanding} was taken from the till against this run and has not come back. Record what it bought, or hand the cash in, before deleting it.`
          : 'Cash moved through the till against this run, so it cannot simply be deleted. File it, or ask a manager to sign it off and void it.',
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
    if (!lines.filter(isLive).length) {
      throw new BadRequestException(
        'A run needs at least one thing bought on it before it can be filed.',
      );
    }

    run.spentTotal = this.liveTotal(lines);
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
        recordedByName: await this.actorName(actor),
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
    const sessionId = dto.registerSessionId ?? run.registerSessionId ?? null;

    /* The DRAWER row is written first, and that ordering is the whole point.
       Cash is in somebody's hand the moment this call is made. If the process
       dies between the two writes, the survivable failure is a till that knows
       money left and a run that does not — a manager can see the payout and fix
       the paperwork. The other order leaves a drawer short with nothing to
       explain it, which is the shape that gets read as a cashier stealing. */
    await this.cashMovements.save(
      this.cashMovements.create({
        branchId: run.branchId,
        registerSessionId: sessionId,
        direction: PosCashMovementDirection.OUT,
        amount,
        currency: run.currency,
        reason: isTopUp
          ? PosCashMovementReason.PURCHASE_TOP_UP
          : PosCashMovementReason.PURCHASE_ADVANCE,
        sourceType: PURCHASE_RUN_SOURCE,
        sourceId: run.id,
        recordedByUserId: actor.userId ?? null,
        recordedByName: await this.actorName(actor),
        occurredAt: new Date(),
        note:
          dto.note ||
          `${isTopUp ? 'Top-up' : 'Advance'} for run #${run.id}${
            run.purchaserName ? ` — ${run.purchaserName}` : ''
          }`,
      }),
    );

    /* Added IN THE DATABASE, not in JavaScript.
       `advanceAmount = read + amount` on a loaded entity loses one of two
       concurrent issues — a cashier and a manager both handing over cash, or
       one double-tap that beat the guard — and the money that goes missing is
       the money that was already handed over. `save(entity)` made it worse by
       rewriting every column from a read that may already be stale. */
    await this.runs
      .createQueryBuilder()
      .update(PurchaseRun)
      .set({
        advanceAmount: () => `COALESCE("advanceAmount", 0) + ${amount}`,
        ...(sessionId != null ? { registerSessionId: sessionId } : {}),
      })
      .where('id = :id', { id: run.id })
      .andWhere('"branchId" = :branchId', { branchId: dto.branchId })
      .execute();

    const fresh = await this.loadRunOrFail(run.id, dto.branchId);
    return this.toRun(fresh, await this.loadLines(fresh.id));
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

    /* Signed, but the expense never got recorded against it.
       The claim and the posting cannot be one atomic act — the books are
       another service with its own repositories — so there is a window where
       the run is APPROVED and `expenseId` is still null. Whatever ended the
       request there, the run is now stuck: every retry used to fall through to
       the conflict below and answer "only a filed run can be signed off",
       forever, while the manager looks at a run they have already approved.
       So the retry FINISHES THE JOB instead. */
    if (run.status === PurchaseRunStatus.APPROVED && run.expenseId == null) {
      return this.postApprovedRun(run, dto.branchId, actor);
    }

    if (run.status !== PurchaseRunStatus.SUBMITTED) {
      throw new ConflictException(
        'Only a filed run can be signed off. This one is ' +
          `${String(run.status).toLowerCase()}.`,
      );
    }

    const lines = await this.loadLines(run.id);
    if (!lines.filter(isLive).length) {
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
        decidedByName: await this.actorName(actor),
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

    return this.postApprovedRun(run, dto.branchId, actor);
  }

  /**
   * Post a run that is already claimed as APPROVED: the expense, then the stock.
   *
   * Split out because it is reached twice — once by an ordinary sign-off, and
   * once by a retry finishing a posting that was interrupted. Both need exactly
   * the same work, and it must be safe to enter with the run already APPROVED.
   */
  /**
   * The expense a previous attempt already posted for this run, if there is one.
   *
   * The claim and the posting are not one atomic act, so an attempt can die
   * having written the expense but not the id that records it. Without this the
   * retry that finishes the job would post a SECOND expense for one market trip
   * — the exact thing the retry exists to prevent.
   *
   * Matched on the deterministic note prefix, which is the only key the billing
   * table offers. Narrow enough to be safe: a voided run's expense is deleted,
   * and a voided run can never be approved again, so nothing stale can match.
   */
  private async findPostedExpense(
    branchId: number,
    runId: number,
  ): Promise<number | null> {
    const row = await this.expenses
      .createQueryBuilder('e')
      .select('e.id', 'id')
      .where('e."branchId" = :branchId', { branchId })
      .andWhere('e.category = :category', {
        category: BranchExpenseCategory.INGREDIENTS,
      })
      .andWhere('e.note LIKE :note', {
        note: `${purchaseRunExpenseNote(runId)}%`,
      })
      .orderBy('e.id', 'ASC')
      .limit(1)
      .getRawOne();
    return row?.id ? Number(row.id) : null;
  }

  private async postApprovedRun(
    run: PurchaseRun,
    branchId: number,
    actor: PurchasingActor,
  ) {
    const lines = await this.loadLines(run.id);

    // A previous attempt may have written the expense and died before recording
    // it. Adopt that one rather than posting the food a second time.
    const already = await this.findPostedExpense(run.branchId, run.id);
    if (already != null) {
      await this.runs.update({ id: run.id }, { expenseId: already });
      const stockFailures = await this.applyStockLines(run, lines, actor);
      const resumed = await this.loadRunOrFail(run.id, branchId);
      return {
        ...this.toRun(resumed, await this.loadLines(run.id)),
        stockFailures,
      };
    }

    let expenseId: number;
    try {
      const expense = await this.billing.createBranchExpense(
        run.branchId,
        actor.userId ?? 0,
        {
          category: BranchExpenseCategory.INGREDIENTS,
          amount: money(run.spentTotal),
          currency: run.currency,
          occurredAt: run.occurredAt,
          note: `${purchaseRunExpenseNote(run.id)}${
            run.label ? ` — ${run.label}` : ''
          }${run.purchaserName ? ` (${run.purchaserName})` : ''}`,
        },
      );
      expenseId = Number(expense.id);
    } catch (error) {
      /* The books refused, so nothing was posted and the signature must not
         stand — released only on THIS path, where the failure is the posting
         itself. It used to be released whenever anything after the claim threw,
         including the write that records the expense id: the expense existed,
         the run went back to SUBMITTED, and the next tap posted a second one
         for the same market trip. */
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

    /* Past this point the money IS in the books, so the claim is never released
       again. A failure here leaves a run that is APPROVED with no expense id —
       which the retry at the top of approveRun picks up and finishes. */
    await this.runs.update({ id: run.id }, { expenseId });

    const stockFailures = await this.applyStockLines(run, lines, actor);

    const fresh = await this.loadRunOrFail(run.id, branchId);
    return {
      ...this.toRun(fresh, await this.loadLines(run.id)),
      /* Which lines were meant to add stock and could not — a product deleted
         from the catalog since the run was written, most likely. Empty on every
         normal approval. Deliberately not an error: the goods are in the kitchen
         and the money is posted, so failing the request would only get the
         manager to tap Approve again. */
      stockFailures,
    };
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
  ): Promise<string[]> {
    const failed: string[] = [];
    for (const line of lines) {
      if (
        !isLive(line) ||
        !line.productId ||
        !line.stockQuantity ||
        line.stockMovementId
      ) {
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
        // Named, not just logged. The money posted either way, so the manager
        // has signed off a run whose stock did not move — and a stock figure
        // that is quietly wrong is worse than one that says so.
        failed.push(line.description);
      }
    }
    return failed;
  }

  /**
   * Strike ONE thing off a run.
   *
   * The manager's alternative to rejecting fifteen good lines because one is
   * wrong. Theirs alone: a purchaser who wants a line gone while the run is
   * still a draft simply removes it, and once it is filed the decision is the
   * signature's.
   *
   * Three rules, and each answers a way this goes wrong quietly:
   *
   *   It never empties a run. Striking the last line standing would leave a
   *   document that bought nothing, holding cash it cannot explain — that is a
   *   whole-run void, and it is refused here so the reversal is recorded as
   *   one. The QSR order void refuses for the same reason.
   *
   *   It always leaves a record. The line is marked, not deleted, so the
   *   largest void of the day is not the one that vanished.
   *
   *   On a run already in the books, the books come with it. The expense is
   *   reposted at the new total and any stock the line moved goes back — a
   *   struck line that stayed in the P&L would be the branch paying for
   *   something it just decided it had not bought.
   */
  async voidLine(
    runId: number,
    lineId: number,
    dto: { branchId: number; reason?: string | null },
    actor: PurchasingActor,
  ) {
    const run = await this.loadRunOrFail(runId, dto.branchId);
    const reason = String(dto.reason || '').trim();
    if (!reason) {
      throw new BadRequestException(
        'Say why it is coming off — the purchaser sees this on their board.',
      );
    }

    if (
      run.status !== PurchaseRunStatus.SUBMITTED &&
      run.status !== PurchaseRunStatus.APPROVED
    ) {
      throw new ConflictException(
        run.status === PurchaseRunStatus.VOID
          ? 'This run has already been reversed in full.'
          : 'This run is still being written — remove the line instead of voiding it.',
      );
    }

    const lines = await this.loadLines(runId);
    const target = lines.find((line) => Number(line.id) === Number(lineId));
    if (!target) throw new NotFoundException('That line was not found.');
    if (!isLive(target)) {
      // Already struck. Answer with the run rather than an error: the manager
      // tapped twice, and the second tap should show them the result.
      return this.toRun(run, lines);
    }

    const liveAfter = lines.filter(
      (line) => isLive(line) && line.id !== target.id,
    );
    if (!liveAfter.length) {
      throw new ConflictException(
        'That is the only thing left on this run. Void the whole run instead, so the reversal is recorded as one.',
      );
    }

    await this.lines.update(
      { id: target.id },
      {
        voidedAt: new Date(),
        voidedByUserId: actor.userId ?? null,
        voidedByName: await this.actorName(actor),
        voidReason: reason,
      },
    );

    // Put the line's stock back before anything else reads the run: it moved
    // when the run was signed off, and it did not buy what it claimed.
    if (target.stockMovementId && target.productId && target.stockQuantity) {
      try {
        await this.inventoryLedger.recordMovement({
          branchId: run.branchId,
          productId: Number(target.productId),
          movementType: StockMovementType.PURCHASE_RECEIPT,
          quantityDelta: -Number(target.stockQuantity),
          sourceType: PURCHASE_RUN_SOURCE,
          sourceReferenceId: run.id,
          actorUserId: actor.userId ?? null,
          note: `Voided line on run #${run.id} — ${target.description}`,
        });
        await this.lines.update({ id: target.id }, { stockMovementId: null });
      } catch (error) {
        this.logger.warn(
          `Purchase run #${run.id} line ${target.id} could not give its stock back: ${
            (error as Error)?.message ?? error
          }`,
        );
      }
    }

    const newTotal = this.liveTotal(liveAfter);
    await this.runs.update({ id: run.id }, { spentTotal: newTotal });

    /* A run already in the books needs the books moved with it. Billing offers
       create and delete and no update, so the expense is replaced — which
       reverses the old ledger entry and posts the new one, exactly what a
       correction should do. Deliberately after the line is marked: if this
       throws, the run reads as having a struck line and an expense that is too
       big, which a manager can see and act on. The other order hides it. */
    if (run.status === PurchaseRunStatus.APPROVED && run.expenseId != null) {
      await this.billing.deleteBranchExpense(
        run.branchId,
        Number(run.expenseId),
      );
      const expense = await this.billing.createBranchExpense(
        run.branchId,
        actor.userId ?? 0,
        {
          category: BranchExpenseCategory.INGREDIENTS,
          amount: newTotal,
          currency: run.currency,
          occurredAt: run.occurredAt,
          note: `${purchaseRunExpenseNote(run.id)}${
            run.label ? ` — ${run.label}` : ''
          }${run.purchaserName ? ` (${run.purchaserName})` : ''}`,
        },
      );
      await this.runs.update({ id: run.id }, { expenseId: Number(expense.id) });
    }

    const fresh = await this.loadRunOrFail(run.id, dto.branchId);
    return this.toRun(fresh, await this.loadLines(run.id));
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
    run.decidedByName = await this.actorName(actor);
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
        decidedByName: await this.actorName(actor),
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
