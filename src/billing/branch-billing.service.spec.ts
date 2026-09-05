import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BranchBillingService } from './branch-billing.service';
import { BranchAccruedLiabilityCategory } from './entities/branch-accrued-liability.entity';
import { BranchFixedAssetCategory } from './entities/branch-fixed-asset.entity';

function createRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (value) => ({ id: 1, ...value })),
    create: jest.fn((value) => value),
    remove: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
  };
}

/**
 * Stand-in for the transaction `applyExpenseVoid` opens.
 *
 * It records what the claiming UPDATE set and hands the same values back from
 * `findOne`, so a test can assert the row came out stamped with who voided it
 * and why. `affected` is settable: 0 is the second tap of a double-tapped Void.
 */
function createVoidTransaction() {
  const state = { affected: 1, set: null as any, row: null as any };
  const repo = {
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        update: jest.fn(() => qb),
        set: jest.fn((value: any) => {
          state.set = value;
          return qb;
        }),
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        execute: jest.fn(async () => ({ affected: state.affected })),
      };
      return qb;
    }),
    findOne: jest.fn(async () => ({
      ...(state.row || {}),
      ...(state.set || {}),
    })),
  };
  const dataSource = {
    transaction: jest.fn(async (fn: any) => fn({ getRepository: () => repo })),
  };
  return { state, repo, dataSource };
}

describe('BranchBillingService', () => {
  function createService() {
    const branchesRepo = createRepo();
    const subscriptionsRepo = createRepo();
    const ebirrRepo = createRepo();
    const expensesRepo = createRepo();
    const fixedAssetsRepo = createRepo();
    const depreciationEntriesRepo = createRepo();
    const accruedLiabilitiesRepo = createRepo();
    const longTermDebtRepo = createRepo();
    const branchStaffService = {
      getPosBranchSummariesForUser: jest.fn().mockResolvedValue([]),
      getPosWorkspaceActivationCandidatesForUser: jest
        .fn()
        .mockResolvedValue([]),
    };
    const generalLedger = {
      post: jest.fn().mockResolvedValue({ id: 1 }),
      reverse: jest.fn().mockResolvedValue(null),
      findEntryByIdempotencyKey: jest.fn().mockResolvedValue(null),
    };

    const staffAssignmentsRepo = createRepo();
    const retailTenantsRepo = createRepo();
    const usersRepo = createRepo();
    const payrollRunsRepo = createRepo();
    const purchaseRunsRepo = createRepo();
    const voidTx = createVoidTransaction();

    const service = new BranchBillingService(
      branchesRepo as any,
      subscriptionsRepo as any,
      ebirrRepo as any,
      expensesRepo as any,
      fixedAssetsRepo as any,
      depreciationEntriesRepo as any,
      accruedLiabilitiesRepo as any,
      longTermDebtRepo as any,
      branchStaffService as any,
      generalLedger as any,
      staffAssignmentsRepo as any,
      retailTenantsRepo as any,
      usersRepo as any,
      payrollRunsRepo as any,
      purchaseRunsRepo as any,
      voidTx.dataSource as any,
    );

    return {
      service,
      voidTx,
      usersRepo,
      payrollRunsRepo,
      purchaseRunsRepo,
      branchesRepo,
      subscriptionsRepo,
      ebirrRepo,
      expensesRepo,
      fixedAssetsRepo,
      depreciationEntriesRepo,
      accruedLiabilitiesRepo,
      longTermDebtRepo,
      branchStaffService,
      generalLedger,
      staffAssignmentsRepo,
      retailTenantsRepo,
    };
  }

  describe('assertBranchAccountingAccess', () => {
    it('lets the branch owner through without touching the staff roster', async () => {
      const { service, branchesRepo, staffAssignmentsRepo } = createService();
      branchesRepo.findOne.mockResolvedValue({ id: 108, ownerId: 2326 });

      await expect(
        service.assertBranchAccountingAccess(108, 2326, ['CUSTOMER']),
      ).resolves.toMatchObject({ id: 108 });
      expect(staffAssignmentsRepo.findOne).not.toHaveBeenCalled();
    });

    it('lets an active branch MANAGER read the branch books', async () => {
      const { service, branchesRepo, staffAssignmentsRepo } = createService();
      branchesRepo.findOne.mockResolvedValue({ id: 108, ownerId: 2326 });
      staffAssignmentsRepo.findOne.mockResolvedValue({
        id: 7,
        branchId: 108,
        userId: 2339,
        role: 'MANAGER',
        isActive: true,
      });

      await expect(
        service.assertBranchAccountingAccess(108, 2339, []),
      ).resolves.toMatchObject({ id: 108 });
      expect(staffAssignmentsRepo.findOne).toHaveBeenCalledWith({
        where: {
          branchId: 108,
          userId: 2339,
          role: 'MANAGER',
          isActive: true,
        },
      });
    });

    it('rejects an operator with no manager assignment', async () => {
      const { service, branchesRepo } = createService();
      branchesRepo.findOne.mockResolvedValue({ id: 108, ownerId: 2326 });

      await expect(
        service.assertBranchAccountingAccess(108, 2338, []),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets the tenant owner through for an untransferred branch', async () => {
      const { service, branchesRepo, retailTenantsRepo } = createService();
      branchesRepo.findOne.mockResolvedValue({
        id: 108,
        ownerId: null,
        retailTenantId: 12,
      });
      retailTenantsRepo.findOne.mockResolvedValue({ id: 12, ownerUserId: 500 });

      await expect(
        service.assertBranchAccountingAccess(108, 500, []),
      ).resolves.toMatchObject({ id: 108 });
    });

    it('rejects the tenant owner once the branch is transferred away', async () => {
      const { service, branchesRepo, retailTenantsRepo } = createService();
      branchesRepo.findOne.mockResolvedValue({
        id: 108,
        ownerId: 2326,
        retailTenantId: 12,
      });
      retailTenantsRepo.findOne.mockResolvedValue({ id: 12, ownerUserId: 500 });

      await expect(
        service.assertBranchAccountingAccess(108, 500, []),
      ).rejects.toThrow(ForbiddenException);
    });

    it('keeps subscription billing owner-only', async () => {
      const { service, branchesRepo, staffAssignmentsRepo } = createService();
      branchesRepo.findOne.mockResolvedValue({ id: 108, ownerId: 2326 });
      staffAssignmentsRepo.findOne.mockResolvedValue({ role: 'MANAGER' });

      await expect(service.assertBranchOwnedBy(108, 2339, [])).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  it('creates fixed assets with owner billing defaults', async () => {
    const { service, fixedAssetsRepo } = createService();

    const result = await service.createBranchFixedAsset(44, {
      name: 'Espresso machine',
      category: BranchFixedAssetCategory.EQUIPMENT,
      acquiredAt: new Date('2026-05-01T00:00:00.000Z'),
      capitalizationAmount: 50000,
    });

    expect(fixedAssetsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 44,
        name: 'Espresso machine',
        category: BranchFixedAssetCategory.EQUIPMENT,
        capitalizationAmount: 50000,
        salvageValue: 0,
        currency: 'ETB',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 1,
        branchId: 44,
        name: 'Espresso machine',
      }),
    );
  });

  it('rejects depreciation entries for assets outside the branch', async () => {
    const { service, fixedAssetsRepo } = createService();

    fixedAssetsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.createBranchDepreciationEntry(44, 7, {
        fixedAssetId: 999,
        amount: 1200,
        occurredAt: new Date('2026-05-02T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates accrued liabilities with due-date support', async () => {
    const { service, accruedLiabilitiesRepo } = createService();

    const result = await service.createBranchAccruedLiability(44, {
      label: 'April payroll accrual',
      category: BranchAccruedLiabilityCategory.PAYROLL,
      amount: 18000,
      accruedAt: new Date('2026-04-30T00:00:00.000Z'),
      dueAt: new Date('2026-05-05T00:00:00.000Z'),
    });

    expect(accruedLiabilitiesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 44,
        label: 'April payroll accrual',
        amount: 18000,
        currency: 'ETB',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 1,
        label: 'April payroll accrual',
      }),
    );
  });

  it('settles accrued liabilities without deleting them', async () => {
    const { service, accruedLiabilitiesRepo } = createService();

    accruedLiabilitiesRepo.findOne.mockResolvedValue({
      id: 12,
      branchId: 44,
      label: 'April payroll accrual',
      status: 'OPEN',
      settledAt: null,
    });

    const result = await service.settleBranchAccruedLiability(
      44,
      12,
      new Date('2026-05-02T00:00:00.000Z'),
    );

    expect(accruedLiabilitiesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 12,
        status: 'SETTLED',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 12,
        label: 'April payroll accrual',
        status: 'SETTLED',
      }),
    );
  });

  it('creates long-term debt with current portion defaults', async () => {
    const { service, longTermDebtRepo } = createService();

    const result = await service.createBranchLongTermDebt(44, {
      lenderName: 'Dashen Bank',
      principalAmount: 120000,
      outstandingPrincipal: 90000,
      issuedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(longTermDebtRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 44,
        lenderName: 'Dashen Bank',
        principalAmount: 120000,
        outstandingPrincipal: 90000,
        currentPortionAmount: 0,
        currency: 'ETB',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 1,
        lenderName: 'Dashen Bank',
      }),
    );
  });

  describe('general-ledger posting', () => {
    const lineFor = (entry: any, code: string) =>
      entry.lines.find((l: any) => l.accountCode === code);

    it('posts an expense (Dr Expense / Cr Cash)', async () => {
      const { service, generalLedger } = createService();
      await service.createBranchExpense(44, 7, {
        category: 'RENT',
        amount: 5000,
        occurredAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      const entry = generalLedger.post.mock.calls[0][0];
      expect(entry.sourceType).toBe('EXPENSE');
      expect(lineFor(entry, '6000').debit).toBe(5000); // EXPENSE_RENT
      expect(lineFor(entry, '1000').credit).toBe(5000); // CASH
    });

    it('draws a long-term loan (Dr Cash / Cr Long-term debt)', async () => {
      const { service, generalLedger } = createService();
      await service.createBranchLongTermDebt(44, {
        lenderName: 'Dashen Bank',
        principalAmount: 120000,
        outstandingPrincipal: 120000,
        issuedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const entry = generalLedger.post.mock.calls[0][0];
      expect(lineFor(entry, '1000').debit).toBe(120000); // CASH
      expect(lineFor(entry, '2600').credit).toBe(120000); // LONG_TERM_DEBT
    });

    it('reverses the ledger entry when an expense is voided', async () => {
      const { service, branchesRepo, expensesRepo, generalLedger, voidTx } =
        createService();
      branchesRepo.findOne.mockResolvedValue({ id: 44, ownerId: 7 });
      expensesRepo.findOne.mockResolvedValue({
        id: 9,
        branchId: 44,
        occurredAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      generalLedger.findEntryByIdempotencyKey.mockResolvedValue({ id: 55 });

      await service.voidBranchExpense(
        44,
        9,
        { userId: 7, roles: [], name: 'Ayan' },
        'Keyed twice.',
      );

      // Inside the transaction that hides the row — not after it, and not
      // best-effort. Both writes land or neither does.
      expect(voidTx.dataSource.transaction).toHaveBeenCalled();
      expect(generalLedger.reverse).toHaveBeenCalledWith(
        55,
        expect.objectContaining({ idempotencyKey: 'reverse-expense-9' }),
        expect.anything(),
      );
    });

    it('keeps the row, stamped with who voided it and why', async () => {
      const { service, branchesRepo, expensesRepo, voidTx } = createService();
      branchesRepo.findOne.mockResolvedValue({ id: 44, ownerId: 7 });
      expensesRepo.findOne.mockResolvedValue({
        id: 9,
        branchId: 44,
        occurredAt: new Date('2026-06-01T00:00:00.000Z'),
      });

      const voided = await service.voidBranchExpense(
        44,
        9,
        { userId: 7, roles: [], name: 'Ayan' },
        'Keyed twice.',
      );

      expect(expensesRepo.remove).not.toHaveBeenCalled();
      expect(voidTx.state.set).toMatchObject({
        voidedByUserId: 7,
        voidedByName: 'Ayan',
        voidReason: 'Keyed twice.',
      });
      expect(voided.voidedAt).toBeInstanceOf(Date);
    });

    it('refuses a void with no reason', async () => {
      const { service, branchesRepo } = createService();
      branchesRepo.findOne.mockResolvedValue({ id: 44, ownerId: 7 });
      await expect(
        service.voidBranchExpense(44, 9, { userId: 7, roles: [] }, '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to void an expense a purchase run posted', async () => {
      // Hand-voiding one used to strand the run: voidRun claimed VOID, then died
      // on the missing expense before reversing the stock, leaving the goods on
      // the shelf as received with the money un-booked.
      const { service, branchesRepo, expensesRepo, purchaseRunsRepo } =
        createService();
      branchesRepo.findOne.mockResolvedValue({ id: 44, ownerId: 7 });
      expensesRepo.findOne.mockResolvedValue({ id: 9, branchId: 44 });
      purchaseRunsRepo.findOne.mockResolvedValue({ id: 42 });

      await expect(
        service.voidBranchExpense(44, 9, { userId: 7, roles: [] }, 'oops'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to void an expense a payroll run posted', async () => {
      const { service, branchesRepo, expensesRepo, payrollRunsRepo } =
        createService();
      branchesRepo.findOne.mockResolvedValue({ id: 44, ownerId: 7 });
      expensesRepo.findOne.mockResolvedValue({ id: 9, branchId: 44 });
      payrollRunsRepo.findOne.mockResolvedValue({
        id: 3,
        periodKey: '2026-07',
      });

      await expect(
        service.voidBranchExpense(44, 9, { userId: 7, roles: [] }, 'oops'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("stops a manager voiding somebody else's expense", async () => {
      const { service, branchesRepo, expensesRepo, staffAssignmentsRepo } =
        createService();
      branchesRepo.findOne.mockResolvedValue({ id: 44, ownerId: 7 });
      staffAssignmentsRepo.findOne.mockResolvedValue({ id: 1, userId: 12 });
      expensesRepo.findOne.mockResolvedValue({
        id: 9,
        branchId: 44,
        recordedByUserId: 7,
        occurredAt: new Date(),
        createdAt: new Date(),
      });

      await expect(
        service.voidBranchExpense(44, 9, { userId: 12, roles: [] }, 'oops'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('stops a manager voiding an expense older than a day', async () => {
      const { service, branchesRepo, expensesRepo, staffAssignmentsRepo } =
        createService();
      branchesRepo.findOne.mockResolvedValue({ id: 44, ownerId: 7 });
      staffAssignmentsRepo.findOne.mockResolvedValue({ id: 1, userId: 12 });
      const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      expensesRepo.findOne.mockResolvedValue({
        id: 9,
        branchId: 44,
        recordedByUserId: 12,
        occurredAt: old,
        createdAt: old,
      });

      await expect(
        service.voidBranchExpense(44, 9, { userId: 12, roles: [] }, 'oops'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets a manager void their own entry from today', async () => {
      const { service, branchesRepo, expensesRepo, staffAssignmentsRepo } =
        createService();
      branchesRepo.findOne.mockResolvedValue({ id: 44, ownerId: 7 });
      staffAssignmentsRepo.findOne.mockResolvedValue({ id: 1, userId: 12 });
      expensesRepo.findOne.mockResolvedValue({
        id: 9,
        branchId: 44,
        recordedByUserId: 12,
        occurredAt: new Date(),
        createdAt: new Date(),
      });

      await expect(
        service.voidBranchExpense(
          44,
          9,
          { userId: 12, roles: [], name: 'Deeq' },
          'Wrong amount.',
        ),
      ).resolves.toBeTruthy();
    });

    it('refuses an expense dated into the future', async () => {
      const { service } = createService();
      await expect(
        service.createBranchExpense(44, 7, {
          category: 'RENT',
          amount: 100,
          occurredAt: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('leaves voided rows out of the list unless asked for them', async () => {
      const { service, expensesRepo } = createService();
      await service.listBranchExpenses(44);
      expect(expensesRepo.find.mock.calls[0][0].where.voidedAt).toBeDefined();

      await service.listBranchExpenses(44, { includeVoided: true });
      expect(expensesRepo.find.mock.calls[1][0].where.voidedAt).toBeUndefined();
    });

    it('corrects an expense by voiding it and posting a replacement', async () => {
      const { service, branchesRepo, expensesRepo, generalLedger } =
        createService();
      branchesRepo.findOne.mockResolvedValue({ id: 44, ownerId: 7 });
      expensesRepo.findOne.mockResolvedValue({
        id: 9,
        branchId: 44,
        category: 'RENT',
        amount: 15000,
        currency: 'ETB',
        occurredAt: new Date('2026-06-01T00:00:00.000Z'),
        note: 'June rent',
      });

      const replacement = await service.amendBranchExpense(
        44,
        9,
        { userId: 7, roles: [], name: 'Ayan' },
        { amount: 1500, reason: 'Keyed 15000 instead of 1500.' },
      );

      // Never a silent UPDATE: the wrong row is voided and a corrected one
      // posted, so the books keep both halves of the correction.
      expect(expensesRepo.remove).not.toHaveBeenCalled();
      expect(replacement.amount).toBe(1500);
      expect(replacement.category).toBe('RENT');
      const posted = generalLedger.post.mock.calls.at(-1)?.[0];
      expect(posted.sourceType).toBe('EXPENSE');
    });

    it('voids a run-posted expense without any of the hand-void guards', async () => {
      const { service, expensesRepo, purchaseRunsRepo, voidTx } =
        createService();
      expensesRepo.findOne.mockResolvedValue({
        id: 9,
        branchId: 44,
        occurredAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      purchaseRunsRepo.findOne.mockResolvedValue({ id: 42 });

      await service.voidBranchExpenseForRun(44, 9, 'Run #42 voided.');
      expect(voidTx.state.set.voidReason).toBe('Run #42 voided.');
    });

    it('never throws when a run undoes an expense that is already gone', async () => {
      // voidRun has already claimed the run as VOID by the time it calls this.
      // Throwing here would skip the stock reversal below it.
      const { service, expensesRepo } = createService();
      expensesRepo.findOne.mockResolvedValue(null);
      await expect(
        service.voidBranchExpenseForRun(44, 9, 'gone'),
      ).resolves.toBeUndefined();
    });

    it('posts a tax remittance against the liability, not as an expense', async () => {
      // Handing collected VAT to the authority discharges TAX_PAYABLE. Debiting
      // an expense account instead would deduct the same tax from profit twice
      // and leave the payable standing forever.
      const { service, generalLedger } = createService();
      await service.createBranchExpense(44, 7, {
        category: 'TAX_REMITTANCE',
        amount: 1200,
        occurredAt: new Date('2026-08-05T00:00:00.000Z'),
      });
      const entry = generalLedger.post.mock.calls[0][0];
      expect(lineFor(entry, '2100').debit).toBe(1200); // TAX_PAYABLE
      expect(lineFor(entry, '1000').credit).toBe(1200); // CASH
      expect(lineFor(entry, '6060')).toBeUndefined(); // never EXPENSE_TAXES
      expect(entry.memo).toBe('Sales tax remitted to the authority');
    });

    it('still books a genuine tax cost as an expense', async () => {
      // TAXES stays what it was — a licence or municipal levy really is a cost.
      const { service, generalLedger } = createService();
      await service.createBranchExpense(44, 7, {
        category: 'TAXES',
        amount: 300,
        occurredAt: new Date('2026-08-05T00:00:00.000Z'),
      });
      const entry = generalLedger.post.mock.calls[0][0];
      expect(lineFor(entry, '6060').debit).toBe(300); // EXPENSE_TAXES
      expect(lineFor(entry, '2100')).toBeUndefined(); // not the liability
    });

    it('posts an owner contribution the other way round (Dr Cash / Cr Equity)', async () => {
      // The one row in branch_expenses where money comes IN. Crediting cash
      // like every other row would book the owner funding the branch as money
      // leaving it.
      const { service, generalLedger } = createService();
      await service.createBranchExpense(44, 7, {
        category: 'OWNER_CONTRIBUTION',
        amount: 20000,
        occurredAt: new Date('2026-09-01T00:00:00.000Z'),
      });
      const entry = generalLedger.post.mock.calls[0][0];
      expect(lineFor(entry, '1000').debit).toBe(20000); // CASH
      expect(lineFor(entry, '3000').credit).toBe(20000); // OWNER_EQUITY
      expect(entry.memo).toBe('Owner capital contributed');
    });
  });
});
