import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  PosCheckout,
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from './entities/pos-checkout.entity';
import {
  PosSuspendedCart,
  PosSuspendedCartStatus,
} from './entities/pos-suspended-cart.entity';
import { PublicReceiptVerificationService } from './public-receipt-verification.service';
import {
  formatReceiptVerificationCode,
  normalizeReceiptVerificationCode,
} from './receipt-verification-code';

describe('normalizeReceiptVerificationCode', () => {
  it('folds the Crockford look-alikes so a typed code matches a scanned one', () => {
    // I/L read as 1 and O reads as 0 on a thermal print — the alphabet omits
    // them, so anyone typing one of them meant the digit.
    expect(normalizeReceiptVerificationCode('9f3k-7qp2-wxol')).toBe(
      '9F3K7QP2WX01',
    );
    expect(normalizeReceiptVerificationCode('  9F3K 7QP2 WX01  ')).toBe(
      '9F3K7QP2WX01',
    );
  });

  it('rejects anything that could not be a minted token', () => {
    expect(normalizeReceiptVerificationCode('')).toBeNull();
    expect(normalizeReceiptVerificationCode('short')).toBeNull();
    expect(normalizeReceiptVerificationCode('A'.repeat(17))).toBeNull();
    expect(normalizeReceiptVerificationCode('9F3K7QP2WX0!')).toBeNull();
    expect(normalizeReceiptVerificationCode(null)).toBeNull();
  });

  it('groups a stored code in fours for printing', () => {
    expect(formatReceiptVerificationCode('9F3K7QP2WX0123')).toBe(
      '9F3K-7QP2-WX01-23',
    );
  });
});

describe('PublicReceiptVerificationService', () => {
  let service: PublicReceiptVerificationService;
  let posCheckoutsRepository: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let suspendedCartsRepository: { createQueryBuilder: jest.Mock };
  let branchesRepository: { findOne: jest.Mock };
  let refundSum: number;
  let slipRow: Record<string, any> | null;

  const CODE = '9F3K7QP2WX0123';

  const sale = (overrides: Partial<PosCheckout> = {}): PosCheckout =>
    ({
      id: 1,
      branchId: 42,
      receiptNumber: 'POS-42-1770000000000',
      verificationCode: CODE,
      transactionType: PosCheckoutTransactionType.SALE,
      status: PosCheckoutStatus.PROCESSED,
      currency: 'ETB',
      total: 500,
      tipAmount: 0,
      itemCount: 3,
      occurredAt: new Date('2026-08-04T09:15:00.000Z'),
      createdAt: new Date('2026-08-04T09:15:04.000Z'),
      voidedAt: null,
      metadata: null,
      ...overrides,
    }) as PosCheckout;

  beforeEach(async () => {
    refundSum = 0;
    slipRow = null;
    posCheckoutsRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(async () => ({ refunded: String(refundSum) })),
      })),
    };
    suspendedCartsRepository = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => slipRow),
      })),
    };
    branchesRepository = {
      findOne: jest.fn(async () => ({
        id: 42,
        name: 'Blue Mall',
        city: 'Jigjiga',
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicReceiptVerificationService,
        {
          provide: getRepositoryToken(PosCheckout),
          useValue: posCheckoutsRepository,
        },
        {
          provide: getRepositoryToken(PosSuspendedCart),
          useValue: suspendedCartsRepository,
        },
        {
          provide: getRepositoryToken(Branch),
          useValue: branchesRepository,
        },
      ],
    }).compile();

    service = module.get(PublicReceiptVerificationService);
  });

  it('reports a settled sale as valid, with the branch and total on the paper', async () => {
    posCheckoutsRepository.findOne.mockResolvedValue(sale());

    const result = await service.verify('9f3k-7qp2-wx01-23');

    expect(result.found).toBe(true);
    expect(result.status).toBe('VALID');
    expect(result.total).toBe(500);
    expect(result.branch).toEqual({ name: 'Blue Mall', city: 'Jigjiga' });
    expect(result.displayCode).toBe('9F3K-7QP2-WX01-23');
    expect(posCheckoutsRepository.findOne).toHaveBeenCalledWith({
      where: { verificationCode: CODE },
    });
  });

  it('never leaks the customer, the cashier or the line items', async () => {
    posCheckoutsRepository.findOne.mockResolvedValue(
      sale({
        cashierName: 'Amina',
        metadata: {
          customerProfile: { name: 'Yusuf', phone: '+251911000000' },
        },
        items: [{ title: 'Sofa', quantity: 1, unitPrice: 500, lineTotal: 500 }],
      }),
    );

    const result = await service.verify(CODE);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('Amina');
    expect(serialized).not.toContain('Yusuf');
    expect(serialized).not.toContain('251911000000');
    expect(serialized).not.toContain('Sofa');
    // itemCount is a count, not a list — safe, and it lets a customer check the
    // paper has not had lines added to it.
    expect(result.itemCount).toBe(3);
  });

  it('does not resolve an unknown or malformed token', async () => {
    posCheckoutsRepository.findOne.mockResolvedValue(null);
    expect(await service.verify(CODE)).toEqual({ found: false });

    // Malformed input never reaches the database at all.
    posCheckoutsRepository.findOne.mockClear();
    expect(await service.verify('nope')).toEqual({ found: false });
    expect(posCheckoutsRepository.findOne).not.toHaveBeenCalled();
  });

  it('surfaces a void', async () => {
    posCheckoutsRepository.findOne.mockResolvedValue(
      sale({ voidedAt: new Date('2026-08-04T10:00:00.000Z') }),
    );
    expect((await service.verify(CODE)).status).toBe('VOIDED');
  });

  it('reports a sale that reached us but never processed as pending', async () => {
    posCheckoutsRepository.findOne.mockResolvedValue(
      sale({ status: PosCheckoutStatus.FAILED }),
    );
    expect((await service.verify(CODE)).status).toBe('PENDING');
  });

  it('nets returns against the sale', async () => {
    posCheckoutsRepository.findOne.mockResolvedValue(sale());

    refundSum = 120;
    let result = await service.verify(CODE);
    expect(result.status).toBe('PARTIALLY_REFUNDED');
    expect(result.refundedAmount).toBe(120);

    // A full reversal, minus a cent of rounding on the return side, is still a
    // full refund — not a "partial" that reads as money withheld.
    refundSum = 499.995;
    result = await service.verify(CODE);
    expect(result.status).toBe('REFUNDED');
  });

  describe('order slips', () => {
    const cart = (overrides: Record<string, any> = {}) => ({
      id: 7,
      branchId: 42,
      label: 'Table 4',
      status: PosSuspendedCartStatus.SUSPENDED,
      currency: 'ETB',
      total: 320,
      itemCount: 3,
      createdAt: new Date('2026-08-04T09:00:00.000Z'),
      updatedAt: new Date('2026-08-04T09:05:00.000Z'),
      ...overrides,
    });

    beforeEach(() => {
      // The token is not a receipt's, so the checkout lookup misses first.
      posCheckoutsRepository.findOne.mockResolvedValue(null);
    });

    it('never lets an unpaid order read as a paid sale', async () => {
      slipRow = cart();

      const result = await service.verify(CODE);

      expect(result.documentType).toBe('ORDER_SLIP');
      expect(result.status).toBe('OPEN');
      // The one thing that must never happen: a slip answering "VALID", the
      // same word a settled receipt gets.
      expect(result.status).not.toBe('VALID');
      expect(result.orderLabel).toBe('Table 4');
      expect(result.total).toBe(320);
    });

    it('points a paid order at the receipt that actually proves payment', async () => {
      slipRow = cart({ status: PosSuspendedCartStatus.DISCARDED });
      posCheckoutsRepository.findOne
        .mockResolvedValueOnce(null) // not a receipt token
        .mockResolvedValueOnce({ receiptNumber: 'POS-42-1770000000000' });

      const result = await service.verify(CODE);

      expect(result.status).toBe('SETTLED');
      expect(result.settledReceiptNumber).toBe('POS-42-1770000000000');
    });

    it('tells a dropped order from a paid one, though both leave the board', async () => {
      slipRow = cart({ status: PosSuspendedCartStatus.DISCARDED });
      // No checkout ever consumed this cart.
      posCheckoutsRepository.findOne.mockResolvedValue(null);

      expect((await service.verify(CODE)).status).toBe('CANCELLED');
    });
  });

  it('does not look for refunds against a return document', async () => {
    posCheckoutsRepository.findOne.mockResolvedValue(
      sale({
        transactionType: PosCheckoutTransactionType.RETURN,
        metadata: {
          returnContext: { sourceReceiptNumber: 'POS-42-1769999999999' },
        },
      }),
    );

    const result = await service.verify(CODE);

    expect(result.status).toBe('VALID');
    expect(result.refundedAmount).toBe(0);
    expect(result.sourceReceiptNumber).toBe('POS-42-1769999999999');
    expect(posCheckoutsRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
