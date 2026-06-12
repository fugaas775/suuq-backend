import { NotFoundException } from '@nestjs/common';
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
    createQueryBuilder: jest.fn(),
  };
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
    );

    return {
      service,
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
    };
  }

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

    it('reverses the ledger entry when an expense is deleted', async () => {
      const { service, expensesRepo, generalLedger } = createService();
      expensesRepo.findOne.mockResolvedValueOnce({
        id: 9,
        branchId: 44,
        occurredAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      generalLedger.findEntryByIdempotencyKey.mockResolvedValueOnce({ id: 55 });
      await service.deleteBranchExpense(44, 9);
      expect(generalLedger.reverse).toHaveBeenCalledWith(
        55,
        expect.objectContaining({ idempotencyKey: 'reverse-expense-9' }),
      );
    });
  });
});
