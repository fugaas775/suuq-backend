import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  GlJournalEntry,
  GlJournalSourceType,
} from './entities/gl-journal-entry.entity';
import { GlJournalLine } from './entities/gl-journal-line.entity';
import { isGlAccountCode, normalBalanceSign } from './gl-accounts.constant';

export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  metadata?: Record<string, unknown> | null;
}

export interface PostJournalEntryInput {
  branchId: number;
  occurredAt: Date;
  sourceType: GlJournalSourceType;
  sourceId?: string | null;
  idempotencyKey: string;
  currency?: string;
  memo?: string | null;
  createdByUserId?: number | null;
  lines: JournalLineInput[];
}

export interface BalanceRange {
  from?: Date | null;
  to?: Date | null;
}

/** Debit/credit must net to within half a cent to count as balanced. */
const BALANCE_TOLERANCE = 0.005;

function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * The double-entry posting engine. Every financial event posts a balanced
 * journal entry through `post()`; the financial statements read account
 * balances through `balance()`.
 *
 * Two invariants are guaranteed here so callers never corrupt the ledger:
 *  - **Balanced**: an entry's debits must equal its credits (else it throws).
 *  - **Idempotent**: posting the same (branchId, idempotencyKey) twice returns
 *    the existing entry unchanged — matching the checkout-ingest idempotency.
 */
@Injectable()
export class GeneralLedgerService {
  constructor(
    @InjectRepository(GlJournalEntry)
    private readonly entries: Repository<GlJournalEntry>,
    @InjectRepository(GlJournalLine)
    private readonly lines: Repository<GlJournalLine>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Post a balanced journal entry. Pass `manager` to enlist in a caller's
   * transaction (e.g. checkout ingest); otherwise a transaction is opened here.
   */
  async post(
    input: PostJournalEntryInput,
    manager?: EntityManager,
  ): Promise<GlJournalEntry> {
    this.assertBalanced(input);
    return manager
      ? this.postWithin(manager, input)
      : this.dataSource.transaction((m) => this.postWithin(m, input));
  }

  private assertBalanced(input: PostJournalEntryInput): void {
    if (!input.idempotencyKey) {
      throw new BadRequestException(
        'Journal entry requires an idempotencyKey.',
      );
    }
    if (!Array.isArray(input.lines) || input.lines.length < 2) {
      throw new BadRequestException(
        'A journal entry needs at least two lines.',
      );
    }
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of input.lines) {
      if (!isGlAccountCode(line.accountCode)) {
        throw new BadRequestException(
          `Unknown GL account code: ${line.accountCode}`,
        );
      }
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      if (debit < 0 || credit < 0) {
        throw new BadRequestException(
          'Journal line debit/credit must be non-negative.',
        );
      }
      if (debit > 0 && credit > 0) {
        throw new BadRequestException(
          'A journal line cannot carry both a debit and a credit.',
        );
      }
      totalDebit += debit;
      totalCredit += credit;
    }
    if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
      throw new BadRequestException(
        `Unbalanced journal entry: debit ${totalDebit} != credit ${totalCredit}.`,
      );
    }
    if (totalDebit === 0) {
      throw new BadRequestException('Journal entry total cannot be zero.');
    }
  }

  private async postWithin(
    manager: EntityManager,
    input: PostJournalEntryInput,
  ): Promise<GlJournalEntry> {
    const entryRepo = manager.getRepository(GlJournalEntry);
    const lineRepo = manager.getRepository(GlJournalLine);

    const existing = await entryRepo.findOne({
      where: {
        branchId: input.branchId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (existing) {
      return existing;
    }

    const currency = input.currency || 'ETB';
    const occurredAt = input.occurredAt;
    const entry = await entryRepo.save(
      entryRepo.create({
        branchId: input.branchId,
        occurredAt,
        postedAt: new Date(),
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        idempotencyKey: input.idempotencyKey,
        currency,
        memo: input.memo ?? null,
        createdByUserId: input.createdByUserId ?? null,
      }),
    );

    const lines = input.lines
      .filter(
        (line) => Number(line.debit || 0) > 0 || Number(line.credit || 0) > 0,
      )
      .map((line) =>
        lineRepo.create({
          entryId: entry.id,
          branchId: input.branchId,
          accountCode: line.accountCode,
          debit: round2(Number(line.debit || 0)),
          credit: round2(Number(line.credit || 0)),
          occurredAt,
          currency,
          metadata: line.metadata ?? null,
        }),
      );
    await lineRepo.save(lines);
    entry.lines = lines;
    return entry;
  }

  /** Look up an entry by its idempotency key (used to find what to reverse). */
  findEntryByIdempotencyKey(
    branchId: number,
    idempotencyKey: string,
  ): Promise<GlJournalEntry | null> {
    return this.entries.findOne({
      where: { branchId, idempotencyKey },
    });
  }

  /**
   * Post a mirror entry that reverses `entryId` (debits↔credits), linking the
   * two. Idempotent on `opts.idempotencyKey` and a no-op if already reversed.
   * Returns null if the original entry does not exist.
   */
  async reverse(
    entryId: number,
    opts: {
      sourceType: GlJournalSourceType;
      idempotencyKey: string;
      occurredAt?: Date;
      memo?: string | null;
      createdByUserId?: number | null;
    },
  ): Promise<GlJournalEntry | null> {
    return this.dataSource.transaction(async (manager) => {
      const entryRepo = manager.getRepository(GlJournalEntry);
      const lineRepo = manager.getRepository(GlJournalLine);

      const original = await entryRepo.findOne({ where: { id: entryId } });
      if (!original) {
        return null;
      }

      const alreadyReversed = await entryRepo.findOne({
        where: {
          branchId: original.branchId,
          idempotencyKey: opts.idempotencyKey,
        },
      });
      if (alreadyReversed) {
        return alreadyReversed;
      }

      const originalLines = await lineRepo.find({ where: { entryId } });
      const occurredAt = opts.occurredAt || new Date();
      const reversal = await entryRepo.save(
        entryRepo.create({
          branchId: original.branchId,
          occurredAt,
          postedAt: new Date(),
          sourceType: opts.sourceType,
          sourceId: original.sourceId ?? null,
          idempotencyKey: opts.idempotencyKey,
          currency: original.currency,
          memo: opts.memo ?? `Reversal of entry ${entryId}`,
          createdByUserId: opts.createdByUserId ?? null,
          reversesEntryId: entryId,
        }),
      );

      const swapped = originalLines.map((line) =>
        lineRepo.create({
          entryId: reversal.id,
          branchId: line.branchId,
          accountCode: line.accountCode,
          debit: line.credit,
          credit: line.debit,
          occurredAt,
          currency: line.currency,
          metadata: line.metadata ?? null,
        }),
      );
      await lineRepo.save(swapped);

      original.reversedByEntryId = reversal.id;
      await entryRepo.save(original);
      reversal.lines = swapped;
      return reversal;
    });
  }

  /**
   * Net balance of an account for a branch, expressed in the account's natural
   * direction (a credit-normal liability with net credits returns positive).
   * Optionally bounded to an occurredAt range (a period for P&L, an as-of upper
   * bound for the balance sheet).
   */
  async balance(
    branchId: number,
    accountCode: string,
    range?: BalanceRange,
  ): Promise<number> {
    const qb = this.lines
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.debit), 0)', 'debit')
      .addSelect('COALESCE(SUM(l.credit), 0)', 'credit')
      .where('l.branchId = :branchId', { branchId })
      .andWhere('l.accountCode = :accountCode', { accountCode });
    if (range?.from) {
      qb.andWhere('l.occurredAt >= :from', { from: range.from });
    }
    if (range?.to) {
      qb.andWhere('l.occurredAt <= :to', { to: range.to });
    }
    const row = await qb.getRawOne<{ debit: string; credit: string }>();
    const debit = Number(row?.debit || 0);
    const credit = Number(row?.credit || 0);
    return round2((debit - credit) * normalBalanceSign(accountCode));
  }

  /**
   * Per-account debit/credit totals for a branch (optionally bounded to an
   * occurredAt range). Used to build the trial balance in one query.
   */
  async accountTotals(
    branchId: number,
    range?: BalanceRange,
  ): Promise<Map<string, { debit: number; credit: number }>> {
    const qb = this.lines
      .createQueryBuilder('l')
      .select('l.accountCode', 'accountCode')
      .addSelect('COALESCE(SUM(l.debit), 0)', 'debit')
      .addSelect('COALESCE(SUM(l.credit), 0)', 'credit')
      .where('l.branchId = :branchId', { branchId })
      .groupBy('l.accountCode');
    if (range?.from) {
      qb.andWhere('l.occurredAt >= :from', { from: range.from });
    }
    if (range?.to) {
      qb.andWhere('l.occurredAt <= :to', { to: range.to });
    }
    const rows = await qb.getRawMany<{
      accountCode: string;
      debit: string;
      credit: string;
    }>();
    const totals = new Map<string, { debit: number; credit: number }>();
    for (const row of rows) {
      totals.set(row.accountCode, {
        debit: Number(row.debit || 0),
        credit: Number(row.credit || 0),
      });
    }
    return totals;
  }
}
