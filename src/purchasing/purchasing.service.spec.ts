import { BadRequestException, ConflictException } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import { PurchaseRunStatus } from './entities/purchase-run.entity';
import {
  PosCashMovementDirection,
  PosCashMovementReason,
} from './entities/pos-cash-movement.entity';

/**
 * The rules a market run stands on, all of which fail quietly if they are wrong:
 * money posted twice, a drawer told about the same change twice, stock added
 * twice, and a purchaser reading somebody else's spending.
 */

const stamp = new Date('2026-08-25T06:00:00.000Z');

function makeService({
  run = null as any,
  lines = [] as any[],
  claimAffected = 1,
  expenseThrows = false,
  existingChangeMovement = null as any,
  cashMovementCount = 0,
} = {}) {
  const savedRuns: any[] = [];
  const updatedRuns: any[] = [];
  const savedLines: any[] = [];
  const savedMovements: any[] = [];
  const postedExpenses: any[] = [];
  const deletedExpenses: any[] = [];
  const stockMovements: any[] = [];

  const runUpdateQb: any = {
    update: () => runUpdateQb,
    set: (values: any) => {
      updatedRuns.push(values);
      return runUpdateQb;
    },
    where: () => runUpdateQb,
    andWhere: () => runUpdateQb,
    execute: async () => ({ affected: claimAffected }),
  };

  const runs: any = {
    create: (row: any) => ({ ...row }),
    save: async (row: any) => {
      const saved = {
        id: row.id ?? 14,
        createdAt: stamp,
        updatedAt: stamp,
        ...row,
      };
      savedRuns.push(saved);
      if (run) Object.assign(run, saved);
      return saved;
    },
    findOne: async () => run,
    update: async (_where: any, values: any) => {
      updatedRuns.push(values);
      if (run) Object.assign(run, values);
      return { affected: 1 };
    },
    delete: async () => ({ affected: 1 }),
    createQueryBuilder: () => runUpdateQb,
  };

  const linesRepo: any = {
    create: (row: any) => ({ ...row }),
    save: async (rows: any) => {
      const list = Array.isArray(rows) ? rows : [rows];
      savedLines.push(...list);
      return list;
    },
    find: async () => lines,
    findOne: async () => null,
    update: async (where: any, values: any) => {
      const target = lines.find((line) => line.id === where.id);
      if (target) Object.assign(target, values);
      return { affected: 1 };
    },
    delete: async () => ({ affected: 1 }),
    createQueryBuilder: () => ({}),
  };

  const cashMovements: any = {
    create: (row: any) => ({ ...row }),
    save: async (row: any) => {
      const saved = { id: savedMovements.length + 1, ...row };
      savedMovements.push(saved);
      return saved;
    },
    find: async () => savedMovements,
    findOne: async () => existingChangeMovement,
    count: async () => cashMovementCount,
  };

  const billing: any = {
    createBranchExpense: async (branchId: number, userId: number, dto: any) => {
      if (expenseThrows) throw new Error('ledger unavailable');
      const expense = {
        id: 900 + postedExpenses.length,
        branchId,
        userId,
        ...dto,
      };
      postedExpenses.push(expense);
      return expense;
    },
    deleteBranchExpense: async (branchId: number, expenseId: number) => {
      deletedExpenses.push({ branchId, expenseId });
    },
  };

  const inventoryLedger: any = {
    recordMovement: async (params: any) => {
      stockMovements.push(params);
      return { movement: { id: 500 + stockMovements.length }, inventory: {} };
    },
  };

  // The roster, consulted only when the token could not name the actor.
  const users: any = {
    findOne: async () => ({ id: 12, displayName: 'Maxamed Cabdi' }),
  };

  const service = new PurchasingService(
    runs,
    linesRepo,
    cashMovements,
    users,
    billing,
    inventoryLedger,
  );

  return {
    service,
    savedRuns,
    updatedRuns,
    savedLines,
    savedMovements,
    postedExpenses,
    deletedExpenses,
    stockMovements,
  };
}

const manager = { userId: 5, name: 'Hodan', canApprove: true };
const purchaser = { userId: 12, name: 'Maxamed', canApprove: false };

function runRow(over: Record<string, unknown> = {}) {
  return {
    id: 14,
    branchId: 44,
    status: PurchaseRunStatus.SUBMITTED,
    label: 'Jigjiga market',
    purchaserUserId: 12,
    purchaserName: 'Maxamed',
    registerSessionId: 91,
    advanceAmount: 2500,
    spentTotal: 2090,
    returnedAmount: null,
    currency: 'ETB',
    occurredAt: stamp,
    submittedAt: stamp,
    decidedAt: null,
    decidedByUserId: null,
    decidedByName: null,
    decisionReason: null,
    expenseId: null,
    note: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...over,
  } as any;
}

function lineRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    runId: 14,
    branchId: 44,
    description: 'Goat meat',
    vendorName: 'Suuqa Hoose',
    quantity: 3,
    unitLabel: 'kg',
    unitPrice: 420,
    lineTotal: 1260,
    productId: null,
    stockQuantity: null,
    stockMovementId: null,
    note: null,
    sortOrder: 0,
    ...over,
  } as any;
}

describe('PurchasingService — approval', () => {
  it('posts exactly one INGREDIENTS expense and records its id on the run', async () => {
    const run = runRow();
    const ctx = makeService({ run, lines: [lineRow()] });

    await ctx.service.approveRun(14, { branchId: 44 }, manager);

    expect(ctx.postedExpenses).toHaveLength(1);
    expect(ctx.postedExpenses[0]).toMatchObject({
      category: 'INGREDIENTS',
      amount: 2090,
      currency: 'ETB',
    });
    expect(ctx.updatedRuns.some((u) => u.expenseId === 900)).toBe(true);
  });

  /**
   * The reason approval claims with a conditional UPDATE. A manager on a slow
   * phone taps Approve twice; the second tap must find nothing left to claim
   * rather than post a second expense for the same food.
   */
  it('refuses a second signature when the claim is already gone', async () => {
    const run = runRow();
    const ctx = makeService({ run, lines: [lineRow()], claimAffected: 0 });

    await expect(
      ctx.service.approveRun(14, { branchId: 44 } as any, manager),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.postedExpenses).toHaveLength(0);
  });

  /** An already-approved run answers the second tap with itself, not an error. */
  it('returns the signed run unchanged when it is tapped again', async () => {
    const run = runRow({ status: PurchaseRunStatus.APPROVED, expenseId: 900 });
    const ctx = makeService({ run, lines: [lineRow()] });

    const result = await ctx.service.approveRun(14, { branchId: 44 }, manager);

    expect(result.status).toBe(PurchaseRunStatus.APPROVED);
    expect(ctx.postedExpenses).toHaveLength(0);
  });

  /**
   * If the books refuse the posting there is no document, so there must be no
   * signature either — otherwise the run reads as approved with nothing behind
   * it and no way to try again.
   */
  it('releases the claim when the expense cannot be posted', async () => {
    const run = runRow();
    const ctx = makeService({ run, lines: [lineRow()], expenseThrows: true });

    await expect(
      ctx.service.approveRun(14, { branchId: 44 } as any, manager),
    ).rejects.toThrow('ledger unavailable');
    expect(
      ctx.updatedRuns.some((u) => u.status === PurchaseRunStatus.SUBMITTED),
    ).toBe(true);
  });

  it('raises stock only for lines that named a product AND a quantity', async () => {
    const run = runRow();
    const lines = [
      lineRow({ id: 1, description: 'Charcoal' }),
      lineRow({
        id: 2,
        description: 'Goat meat',
        productId: 77,
        stockQuantity: 12,
      }),
      // A product with no quantity adds nothing; a quantity with no product has
      // nowhere to go. Neither should reach the ledger.
      lineRow({ id: 3, description: 'Onions', productId: 78 }),
    ];
    const ctx = makeService({ run, lines });

    await ctx.service.approveRun(14, { branchId: 44 }, manager);

    expect(ctx.stockMovements).toHaveLength(1);
    expect(ctx.stockMovements[0]).toMatchObject({
      productId: 77,
      quantityDelta: 12,
      movementType: 'PURCHASE_RECEIPT',
      sourceReferenceId: 14,
    });
    expect(lines[1].stockMovementId).toBe(501);
  });

  it('does not raise stock twice for a line that already moved', async () => {
    const run = runRow();
    const lines = [
      lineRow({
        id: 2,
        productId: 77,
        stockQuantity: 12,
        stockMovementId: 501,
      }),
    ];
    const ctx = makeService({ run, lines });

    await ctx.service.approveRun(14, { branchId: 44 }, manager);

    expect(ctx.stockMovements).toHaveLength(0);
  });
});

describe('PurchasingService — filing and the drawer', () => {
  it('records the change coming back as cash INTO the drawer', async () => {
    const run = runRow({ status: PurchaseRunStatus.DRAFT, submittedAt: null });
    const ctx = makeService({ run, lines: [lineRow()] });

    await ctx.service.submitRun(
      14,
      { branchId: 44, returnedAmount: 410 },
      purchaser,
    );

    expect(ctx.savedMovements).toHaveLength(1);
    expect(ctx.savedMovements[0]).toMatchObject({
      direction: PosCashMovementDirection.IN,
      amount: 410,
      reason: PosCashMovementReason.PURCHASE_CHANGE_RETURN,
      registerSessionId: 91,
      sourceId: 14,
    });
  });

  /**
   * A rejected run comes back editable and is filed again. Without the guard the
   * till would be told the same change came back twice — and a drawer that is
   * OVER is a discrepancy exactly like one that is short.
   */
  it('does not tell the drawer about the same change twice', async () => {
    const run = runRow({ status: PurchaseRunStatus.REJECTED });
    const ctx = makeService({
      run,
      lines: [lineRow()],
      existingChangeMovement: { id: 3 },
    });

    await ctx.service.submitRun(
      14,
      { branchId: 44, returnedAmount: 410 },
      purchaser,
    );

    expect(ctx.savedMovements).toHaveLength(0);
  });

  it('refuses to file a run with nothing on it', async () => {
    const run = runRow({ status: PurchaseRunStatus.DRAFT });
    const ctx = makeService({ run, lines: [] });

    await expect(
      ctx.service.submitRun(14, { branchId: 44 } as any, purchaser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to file a run whose lines all cost nothing', async () => {
    const run = runRow({ status: PurchaseRunStatus.DRAFT });
    const ctx = makeService({
      run,
      lines: [lineRow({ unitPrice: 0, lineTotal: 0 })],
    });

    await expect(
      ctx.service.submitRun(14, { branchId: 44 } as any, purchaser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('takes an advance OUT of the drawer, and calls the second one a top-up', async () => {
    const run = runRow({
      status: PurchaseRunStatus.DRAFT,
      advanceAmount: null,
    });
    const ctx = makeService({ run, lines: [lineRow()] });

    await ctx.service.issueAdvance(
      14,
      { branchId: 44, amount: 2500, registerSessionId: 91 },
      manager,
    );
    await ctx.service.issueAdvance(
      14,
      { branchId: 44, amount: 300, registerSessionId: 91 },
      manager,
    );

    expect(ctx.savedMovements.map((m) => m.reason)).toEqual([
      PosCashMovementReason.PURCHASE_ADVANCE,
      PosCashMovementReason.PURCHASE_TOP_UP,
    ]);
    expect(ctx.savedMovements.every((m) => m.direction === 'OUT')).toBe(true);
    expect(run.advanceAmount).toBe(2800);
  });

  it('will not issue cash against a run that is already signed off', async () => {
    const run = runRow({ status: PurchaseRunStatus.APPROVED });
    const ctx = makeService({ run, lines: [lineRow()] });

    await expect(
      ctx.service.issueAdvance(
        14,
        { branchId: 44, amount: 100 } as any,
        manager,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PurchasingService — deleting a run', () => {
  it('deletes a draft nothing has moved against', async () => {
    const run = runRow({
      status: PurchaseRunStatus.DRAFT,
      advanceAmount: null,
    });
    const ctx = makeService({ run, lines: [lineRow()] });
    await expect(ctx.service.deleteRun(14, 44, manager)).resolves.toMatchObject(
      {
        deleted: true,
      },
    );
  });

  /**
   * The bug SMAK QSR found. A deleted run left its drawer rows behind, pointing
   * at a document nobody could open — so the till stayed short by the advance
   * with nothing on the board to explain it, which is the exact shape of a
   * discrepancy that gets read as theft.
   *
   * Refused rather than reversed: a reversal would be a claim the cash came
   * back, and nothing here knows that.
   */
  it('refuses to delete a draft that cash was taken out against', async () => {
    const run = runRow({
      status: PurchaseRunStatus.DRAFT,
      advanceAmount: 1000,
      returnedAmount: 100,
    });
    const ctx = makeService({ run, lines: [lineRow()], cashMovementCount: 2 });

    await expect(ctx.service.deleteRun(14, 44, manager)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(ctx.service.deleteRun(14, 44, manager)).rejects.toThrow(/900/);
  });

  it('still refuses when the cash all came back, because it moved', async () => {
    const run = runRow({
      status: PurchaseRunStatus.DRAFT,
      advanceAmount: 1000,
      returnedAmount: 1000,
    });
    const ctx = makeService({ run, lines: [lineRow()], cashMovementCount: 2 });
    await expect(ctx.service.deleteRun(14, 44, manager)).rejects.toThrow(
      /cannot simply be deleted/,
    );
  });
});

describe('PurchasingService — the name on the document', () => {
  /**
   * A POS-scoped token states `email` and no `displayName`, and a manual staff
   * account's email is synthetic. SMAK QSR's board showed a run filed by
   * "pos.m.pos.m.purchaser.qsr@sys.internal", which is a machine address on a
   * record an owner reads for months.
   */
  it('falls back to the roster when the token only has a synthetic address', async () => {
    const ctx = makeService({ run: runRow(), lines: [] });
    await ctx.service.createRun(
      { branchId: 44 },
      {
        userId: 12,
        name: 'pos.m.purchaser.qsr@sys.internal',
        canApprove: false,
      },
    );
    expect(ctx.savedRuns[0].purchaserName).toBe('Maxamed Cabdi');
  });

  it('keeps a real name the token already carried', async () => {
    const ctx = makeService({ run: runRow(), lines: [] });
    await ctx.service.createRun(
      { branchId: 44 },
      {
        userId: 12,
        name: 'Hodan Yusuf',
        canApprove: true,
      },
    );
    expect(ctx.savedRuns[0].purchaserName).toBe('Hodan Yusuf');
  });
});

describe('PurchasingService — who sees what', () => {
  /**
   * Matched on the user id, never the name. Two people called Maxamed on one
   * roster is not a rare case here.
   */
  it("hides another purchaser's run from a purchaser", async () => {
    const run = runRow({ purchaserUserId: 99, purchaserName: 'Maxamed' });
    const ctx = makeService({ run, lines: [lineRow()] });

    await expect(ctx.service.getRun(14, 44, purchaser)).rejects.toThrow(
      'That purchase run was not found.',
    );
  });

  it('shows any run to somebody who can sign them off', async () => {
    const run = runRow({ purchaserUserId: 99 });
    const ctx = makeService({ run, lines: [lineRow()] });

    const result = await ctx.service.getRun(14, 44, manager);
    expect(result.id).toBe(14);
  });

  it('refuses to edit a run that has already been filed', async () => {
    const run = runRow({ status: PurchaseRunStatus.SUBMITTED });
    const ctx = makeService({ run, lines: [lineRow()] });

    await expect(
      ctx.service.updateRun(14, { branchId: 44, lines: [] } as any, purchaser),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PurchasingService — reversal', () => {
  it('takes the expense and the stock back, and leaves the cash alone', async () => {
    const run = runRow({ status: PurchaseRunStatus.APPROVED, expenseId: 900 });
    const lines = [
      lineRow({
        id: 2,
        productId: 77,
        stockQuantity: 12,
        stockMovementId: 501,
      }),
    ];
    const ctx = makeService({ run, lines });

    await ctx.service.voidRun(
      14,
      { branchId: 44, reason: 'Bought twice' },
      manager,
    );

    expect(ctx.deletedExpenses).toEqual([{ branchId: 44, expenseId: 900 }]);
    expect(ctx.stockMovements).toHaveLength(1);
    expect(ctx.stockMovements[0].quantityDelta).toBe(-12);
    expect(lines[0].stockMovementId).toBeNull();
    // The advance really was handed over and the change really did come back.
    // A void reverses the document, not the afternoon.
    expect(ctx.savedMovements).toHaveLength(0);
  });

  it('insists on a reason', async () => {
    const run = runRow({ status: PurchaseRunStatus.APPROVED, expenseId: 900 });
    const ctx = makeService({ run, lines: [lineRow()] });

    await expect(
      ctx.service.voidRun(14, { branchId: 44 } as any, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PurchasingService — what a thing cost last time', () => {
  /**
   * The query derives every unit price as total ÷ quantity rather than reading
   * the optional `unitPrice` column. Live on SMAK QSR a sack of charcoal typed
   * as a flat 350 came back as "between 0 and 0" with an average of 350 — a
   * range nobody paid, on the one screen a purchaser argues with at a stall.
   */
  it('derives min, max and last from the line total, never from the optional unit price', async () => {
    const raw: Record<string, unknown>[] = [];
    const qb: any = {
      innerJoin: () => qb,
      where: () => qb,
      andWhere: () => qb,
      select: (expr: string, alias: string) => {
        raw.push({ expr, alias });
        return qb;
      },
      addSelect: (expr: string, alias: string) => {
        raw.push({ expr, alias });
        return qb;
      },
      groupBy: () => qb,
      orderBy: () => qb,
      limit: () => qb,
      getRawMany: async () => [],
    };
    const ctx = makeService();
    (ctx.service as any).lines.createQueryBuilder = () => qb;

    await ctx.service.priceHistory({ branchId: 44 });

    const by = (alias: string) =>
      String(raw.find((r) => r.alias === alias)?.expr ?? '');

    for (const alias of ['minUnitPrice', 'maxUnitPrice', 'lastUnitPrice']) {
      const expr = by(alias);
      expect(expr).toContain('"lineTotal"');
      expect(expr).toContain('NULLIF');
      // The column that may never have been typed.
      expect(expr).not.toContain('"unitPrice"');
    }
    // And the last one is genuinely the most recent, not just any row.
    expect(by('lastUnitPrice')).toContain('ORDER BY run."occurredAt" DESC');
  });
});

describe('PurchasingService — the balance a purchaser is holding', () => {
  it('reports what has not come back yet', async () => {
    const run = runRow({
      advanceAmount: 2500,
      spentTotal: 2090,
      returnedAmount: 410,
    });
    const ctx = makeService({ run, lines: [lineRow()] });

    const result = await ctx.service.getRun(14, 44, manager);
    expect(result.balance).toBe(0);
  });

  it('reports a shortfall as the branch owing the purchaser', async () => {
    const run = runRow({
      advanceAmount: 2000,
      spentTotal: 2090,
      returnedAmount: 0,
    });
    const ctx = makeService({ run, lines: [lineRow()] });

    const result = await ctx.service.getRun(14, 44, manager);
    expect(result.balance).toBe(-90);
  });

  /** No advance, nothing to reconcile — it was never the branch's cash. */
  it('has no balance at all when no advance was issued', async () => {
    const run = runRow({ advanceAmount: null });
    const ctx = makeService({ run, lines: [lineRow()] });

    const result = await ctx.service.getRun(14, 44, manager);
    expect(result.balance).toBeNull();
  });
});
