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
  alreadyPostedExpenseId = null,
  cashRows = null as any[] | null,
} = {}) {
  const savedRuns: any[] = [];
  const updatedRuns: any[] = [];
  const savedLines: any[] = [];
  const savedMovements: any[] = [];
  const postedExpenses: any[] = [];
  const deletedExpenses: any[] = [];
  const stockMovements: any[] = [];

  // Mirrors the conditional UPDATE the service claims a run with: the values
  // land on the row only when the claim actually won, so a test with
  // claimAffected 0 sees a run that never moved.
  let pending: any = null;
  const runUpdateQb: any = {
    update: () => runUpdateQb,
    set: (values: any) => {
      pending = values;
      updatedRuns.push(values);
      return runUpdateQb;
    },
    where: () => runUpdateQb,
    andWhere: () => runUpdateQb,
    execute: async () => {
      if (claimAffected && run && pending) {
        for (const [key, value] of Object.entries(pending)) {
          /* A function value is raw SQL — the service adds the advance IN THE
             DATABASE so two concurrent issues cannot lose one. Emulated here
             rather than skipped, so the test still asserts the arithmetic and
             not just that an UPDATE was attempted. */
          if (typeof value === 'function') {
            const sql = String((value as () => string)());
            const delta = Number(sql.match(/\+\s*([0-9.]+)/)?.[1] ?? 0);
            run[key] =
              Math.round(((Number(run[key]) || 0) + delta) * 100) / 100;
          } else {
            run[key] = value;
          }
        }
      }
      pending = null;
      return { affected: claimAffected };
    },
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
    manager: {
      transaction: async (fn: any) =>
        fn({
          delete: async () => ({ affected: 1 }),
          save: async (_entity: any, rows: any) => {
            const list = Array.isArray(rows) ? rows : [rows];
            savedLines.push(...list);
            return list;
          },
        }),
    },
  };

  const cashMovements: any = {
    create: (row: any) => ({ ...row }),
    save: async (row: any) => {
      const saved = { id: savedMovements.length + 1, ...row };
      savedMovements.push(saved);
      return saved;
    },
    find: async () => cashRows ?? savedMovements,
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

  // The books, read only to recognise an expense a previous attempt wrote.
  const expenseQb: any = {
    select: () => expenseQb,
    addSelect: () => expenseQb,
    where: () => expenseQb,
    andWhere: () => expenseQb,
    orderBy: () => expenseQb,
    limit: () => expenseQb,
    getRawOne: async () =>
      alreadyPostedExpenseId ? { id: alreadyPostedExpenseId } : null,
  };
  const expensesRepo: any = { createQueryBuilder: () => expenseQb };

  const service = new PurchasingService(
    runs,
    linesRepo,
    cashMovements,
    users,
    expensesRepo,
    billing,
    inventoryLedger,
  );

  return {
    service,
    runsRepo: runs,
    linesRepo,
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

  /**
   * A product deleted from the catalog since the run was written. The money is
   * posted and the goods are in the kitchen, so the approval must not fail —
   * but a stock figure that is quietly wrong is worse than one that says so.
   */
  it('names the lines whose stock could not move, without failing the approval', async () => {
    const run = runRow();
    const lines = [
      lineRow({ id: 1, description: 'Charcoal' }),
      lineRow({
        id: 2,
        description: 'Ukun (eggs)',
        productId: 999999,
        stockQuantity: 180,
      }),
    ];
    const ctx = makeService({ run, lines });
    (ctx.service as any).inventoryLedger.recordMovement = async () => {
      throw new Error('product not found');
    };

    const result: any = await ctx.service.approveRun(
      14,
      { branchId: 44 },
      manager,
    );

    expect(result.status).toBe(PurchaseRunStatus.APPROVED);
    expect(ctx.postedExpenses).toHaveLength(1);
    expect(result.stockFailures).toEqual(['Ukun (eggs)']);
  });

  it('reports no stock failures on an ordinary approval', async () => {
    const run = runRow();
    const ctx = makeService({
      run,
      lines: [lineRow({ id: 2, productId: 77, stockQuantity: 12 })],
    });
    const result: any = await ctx.service.approveRun(
      14,
      { branchId: 44 },
      manager,
    );
    expect(result.stockFailures).toEqual([]);
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

describe('PurchasingService — one market trip, one run', () => {
  /**
   * Filing is a POST from a phone standing in a market: the write lands, the
   * response does not come back, and the purchaser taps again. Without a ref
   * that is a second run for one trip — and two expenses once both are signed
   * off.
   */
  it('returns the run it already made when a retry carries the same ref', async () => {
    const existing = runRow({ id: 40, clientRef: 'run-abc' });
    const ctx = makeService({ run: existing, lines: [lineRow()] });

    const result = await ctx.service.createRun(
      {
        branchId: 44,
        clientRef: 'run-abc',
        lines: [{ description: 'Yaanyo', lineTotal: 300 }],
      },
      purchaser,
    );

    expect(result.id).toBe(40);
    // Nothing new written: not the run, not its lines.
    expect(ctx.savedRuns).toHaveLength(0);
    expect(ctx.savedLines).toHaveLength(0);
  });

  /**
   * Two taps close enough together that both read an empty table. The unique
   * index is the real guard; losing that race must still look like success.
   */
  it('reads back the winner when two identical taps race', async () => {
    const ctx = makeService({ run: null, lines: [] });
    let looked = 0;
    ctx.runsRepo.findOne = async () => {
      looked += 1;
      // Nothing on the pre-check; the winner's row on the post-violation read.
      return looked === 1 ? null : runRow({ id: 41, clientRef: 'run-xyz' });
    };
    ctx.runsRepo.save = async () => {
      const err: any = new Error('duplicate key');
      err.code = '23505';
      throw err;
    };

    const result = await ctx.service.createRun(
      { branchId: 44, clientRef: 'run-xyz', lines: [] },
      purchaser,
    );
    expect(result.id).toBe(41);
  });

  /** No ref, no idempotency — an older client still gets a run. */
  it('still creates a run when the device sent no ref', async () => {
    const ctx = makeService({ run: null, lines: [] });
    ctx.runsRepo.findOne = async () => null;
    const result = await ctx.service.createRun(
      { branchId: 44, lines: [] },
      purchaser,
    );
    expect(ctx.savedRuns).toHaveLength(1);
    expect(ctx.savedRuns[0].clientRef).toBeNull();
    expect(result.status).toBe(PurchaseRunStatus.DRAFT);
  });
});

describe('PurchasingService — an interrupted sign-off', () => {
  /**
   * The claim and the posting cannot be one atomic act — the books are another
   * service with their own repositories — so a request can end with the run
   * APPROVED and `expenseId` still null. Every retry used to answer "only a
   * filed run can be signed off", forever, at a run the manager had already
   * approved.
   */
  it('finishes a posting that was interrupted, instead of refusing forever', async () => {
    const run = runRow({ status: PurchaseRunStatus.APPROVED, expenseId: null });
    const ctx = makeService({ run, lines: [lineRow()] });

    const result: any = await ctx.service.approveRun(
      14,
      { branchId: 44 },
      manager,
    );

    expect(result.status).toBe(PurchaseRunStatus.APPROVED);
    expect(ctx.postedExpenses).toHaveLength(1);
    expect(ctx.updatedRuns.some((u) => u.expenseId === 900)).toBe(true);
  });

  /**
   * …and if the interruption came AFTER the expense was written, the retry must
   * adopt it. Posting again would put one market trip in the books twice, which
   * is the very thing the retry exists to prevent.
   */
  it('adopts an expense a previous attempt already wrote', async () => {
    const run = runRow({ status: PurchaseRunStatus.APPROVED, expenseId: null });
    const ctx = makeService({
      run,
      lines: [lineRow()],
      alreadyPostedExpenseId: 777,
    });

    const result: any = await ctx.service.approveRun(
      14,
      { branchId: 44 },
      manager,
    );

    expect(ctx.postedExpenses).toHaveLength(0);
    expect(ctx.updatedRuns.some((u) => u.expenseId === 777)).toBe(true);
    expect(result.status).toBe(PurchaseRunStatus.APPROVED);
  });

  /**
   * The claim is released only when the BOOKS refused. It used to be released
   * whenever anything after the claim threw — including the write that records
   * the expense id — so the expense existed, the run went back to SUBMITTED,
   * and the next tap posted a second one for the same trip.
   */
  it('does not release the claim once the money is in the books', async () => {
    const run = runRow();
    const ctx = makeService({ run, lines: [lineRow()] });
    ctx.runsRepo.update = async (_where: any, values: any) => {
      if (values.expenseId != null) throw new Error('connection lost');
      ctx.updatedRuns.push(values);
      Object.assign(run, values);
      return { affected: 1 };
    };

    await expect(
      ctx.service.approveRun(14, { branchId: 44 } as any, manager),
    ).rejects.toThrow('connection lost');

    expect(ctx.postedExpenses).toHaveLength(1);
    // Still signed. Rolling back here is what produced the second expense.
    expect(
      ctx.updatedRuns.some((u) => u.status === PurchaseRunStatus.SUBMITTED),
    ).toBe(false);
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

describe('PurchasingService — the document against the till', () => {
  /**
   * The run and its drawer rows are two writes that cannot be one, and the
   * order was chosen so an interruption leaves the TILL right and the paperwork
   * behind. That is only the survivable direction if somebody can see it.
   */
  it('reports agreement when the two tell the same story', async () => {
    const run = runRow({ advanceAmount: 2500, returnedAmount: 410 });
    const ctx = makeService({
      run,
      lines: [lineRow()],
      cashRows: [
        { direction: 'OUT', amount: 2500 },
        { direction: 'IN', amount: 410 },
      ],
    });
    const result: any = await ctx.service.getRun(14, 44, manager);
    expect(result.cash).toMatchObject({
      drawerPaidOut: 2500,
      drawerPaidIn: 410,
      mismatch: false,
    });
  });

  it('says so when the till paid out more than the run admits', async () => {
    const run = runRow({ advanceAmount: 2500, returnedAmount: 410 });
    const ctx = makeService({
      run,
      lines: [lineRow()],
      // The advance row landed; the run's increment did not.
      cashRows: [
        { direction: 'OUT', amount: 2500 },
        { direction: 'OUT', amount: 300 },
        { direction: 'IN', amount: 410 },
      ],
    });
    const result: any = await ctx.service.getRun(14, 44, manager);
    expect(result.cash.drawerPaidOut).toBe(2800);
    expect(result.cash.mismatch).toBe(true);
  });

  /** A run nobody funded has nothing to disagree about. */
  it('is quiet on a run with no cash against it', async () => {
    const run = runRow({ advanceAmount: null, returnedAmount: null });
    const ctx = makeService({ run, lines: [lineRow()], cashRows: [] });
    const result: any = await ctx.service.getRun(14, 44, manager);
    expect(result.cash).toMatchObject({
      drawerPaidOut: 0,
      drawerPaidIn: 0,
      mismatch: false,
    });
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
