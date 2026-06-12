import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GeneralLedgerService } from './general-ledger.service';
import { GlAccountCode } from './gl-accounts.constant';
import {
  GlJournalEntry,
  GlJournalSourceType,
} from './entities/gl-journal-entry.entity';
import { GlJournalLine } from './entities/gl-journal-line.entity';

describe('GeneralLedgerService', () => {
  let service: GeneralLedgerService;
  let entryRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let lineRepo: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let injectedLineRepo: { createQueryBuilder: jest.Mock };
  let qb: Record<string, jest.Mock>;

  let nextEntryId = 100;

  beforeEach(async () => {
    nextEntryId = 100;
    entryRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v: any) => ({ ...v })),
      save: jest.fn(async (v: any) => ({ id: v.id ?? nextEntryId++, ...v })),
    };
    qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ debit: '0', credit: '0' }),
    };
    lineRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((v: any) => ({ ...v })),
      save: jest.fn(async (v: any) => v),
      createQueryBuilder: jest.fn(() => qb),
    };
    injectedLineRepo = { createQueryBuilder: jest.fn(() => qb) };

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === GlJournalEntry) return entryRepo;
        if (entity === GlJournalLine) return lineRepo;
        return {};
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneralLedgerService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(GlJournalEntry), useValue: entryRepo },
        {
          provide: getRepositoryToken(GlJournalLine),
          useValue: injectedLineRepo,
        },
      ],
    }).compile();

    service = module.get(GeneralLedgerService);
  });

  const saleLines = () => [
    { accountCode: GlAccountCode.CASH, debit: 100 },
    { accountCode: GlAccountCode.SERVICE_REVENUE, credit: 100 },
  ];

  it('posts a balanced entry with its lines', async () => {
    const entry = await service.post({
      branchId: 1,
      occurredAt: new Date('2026-06-12T00:00:00Z'),
      sourceType: GlJournalSourceType.POS_CHECKOUT,
      idempotencyKey: 'k1',
      lines: saleLines(),
    });

    expect(entry.id).toBe(100);
    expect(entry.lines).toHaveLength(2);
    expect(entryRepo.save).toHaveBeenCalledTimes(1);
    expect(lineRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects an unbalanced entry before touching the DB', async () => {
    await expect(
      service.post({
        branchId: 1,
        occurredAt: new Date(),
        sourceType: GlJournalSourceType.POS_CHECKOUT,
        idempotencyKey: 'k2',
        lines: [
          { accountCode: GlAccountCode.CASH, debit: 100 },
          { accountCode: GlAccountCode.SERVICE_REVENUE, credit: 90 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(entryRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an unknown account code', async () => {
    await expect(
      service.post({
        branchId: 1,
        occurredAt: new Date(),
        sourceType: GlJournalSourceType.POS_CHECKOUT,
        idempotencyKey: 'k3',
        lines: [
          { accountCode: '9999', debit: 100 },
          { accountCode: GlAccountCode.SERVICE_REVENUE, credit: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a line carrying both a debit and a credit', async () => {
    await expect(
      service.post({
        branchId: 1,
        occurredAt: new Date(),
        sourceType: GlJournalSourceType.POS_CHECKOUT,
        idempotencyKey: 'k4',
        lines: [
          { accountCode: GlAccountCode.CASH, debit: 100, credit: 100 },
          { accountCode: GlAccountCode.SERVICE_REVENUE, credit: 100 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is idempotent — returns the existing entry without re-inserting', async () => {
    const existing = { id: 5, idempotencyKey: 'dupe', lines: [] };
    entryRepo.findOne.mockResolvedValueOnce(existing);

    const result = await service.post({
      branchId: 1,
      occurredAt: new Date(),
      sourceType: GlJournalSourceType.POS_CHECKOUT,
      idempotencyKey: 'dupe',
      lines: saleLines(),
    });

    expect(result).toBe(existing);
    expect(entryRepo.save).not.toHaveBeenCalled();
    expect(lineRepo.save).not.toHaveBeenCalled();
  });

  it('reverses an entry by swapping debits and credits and links both', async () => {
    const original = {
      id: 7,
      branchId: 1,
      currency: 'ETB',
      sourceId: 'rcpt-1',
      reversedByEntryId: null,
    };
    entryRepo.findOne
      .mockResolvedValueOnce(original) // lookup by id
      .mockResolvedValueOnce(null); // not already reversed
    lineRepo.find.mockResolvedValueOnce([
      {
        accountCode: GlAccountCode.CASH,
        debit: 100,
        credit: 0,
        branchId: 1,
        currency: 'ETB',
      },
      {
        accountCode: GlAccountCode.SERVICE_REVENUE,
        debit: 0,
        credit: 100,
        branchId: 1,
        currency: 'ETB',
      },
    ]);

    const reversal = await service.reverse(7, {
      sourceType: GlJournalSourceType.POS_VOID_REVERSAL,
      idempotencyKey: 'void-7',
    });

    expect(reversal?.reversesEntryId).toBe(7);
    const cash = reversal.lines.find(
      (l) => l.accountCode === GlAccountCode.CASH,
    );
    const revenue = reversal.lines.find(
      (l) => l.accountCode === GlAccountCode.SERVICE_REVENUE,
    );
    expect(cash).toMatchObject({ debit: 0, credit: 100 });
    expect(revenue).toMatchObject({ debit: 100, credit: 0 });
    // The original is stamped as reversed.
    expect(original.reversedByEntryId).toBe(reversal.id);
  });

  it('reverse is a no-op when the entry was already reversed', async () => {
    const original = { id: 7, branchId: 1, currency: 'ETB' };
    const prior = { id: 8, reversesEntryId: 7 };
    entryRepo.findOne
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(prior);

    const result = await service.reverse(7, {
      sourceType: GlJournalSourceType.POS_VOID_REVERSAL,
      idempotencyKey: 'void-7',
    });

    expect(result).toBe(prior);
    expect(lineRepo.save).not.toHaveBeenCalled();
  });

  it('computes a debit-normal balance as debit minus credit', async () => {
    qb.getRawOne.mockResolvedValueOnce({ debit: '100', credit: '40' });
    const cash = await service.balance(1, GlAccountCode.CASH);
    expect(cash).toBe(60);
  });

  it('computes a credit-normal balance as a positive liability/revenue figure', async () => {
    qb.getRawOne.mockResolvedValueOnce({ debit: '0', credit: '100' });
    const revenue = await service.balance(1, GlAccountCode.SERVICE_REVENUE);
    expect(revenue).toBe(100);
  });
});
