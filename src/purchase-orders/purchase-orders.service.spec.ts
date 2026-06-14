import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderStatus } from './entities/purchase-order.entity';

/**
 * Focused coverage of the goods-received ledger posting (Dr Inventory / Cr
 * Supplier payables). The full service has a large dependency surface; these
 * tests construct it positionally and exercise only the posting path.
 */
function makeService(
  generalLedger: any,
  receiptEventsRepo: any = {},
): PurchaseOrdersService {
  const noop: any = {};
  return new PurchaseOrdersService(
    noop, // dataSource
    noop, // purchaseOrdersRepository
    noop, // branchesRepository
    noop, // supplierProfilesRepository
    noop, // productsRepository
    noop, // supplierOffersRepository
    receiptEventsRepo, // purchaseOrderReceiptEventsRepository
    noop, // auditService
    noop, // inventoryLedgerService
    noop, // replenishmentService
    noop, // procurementWebhooksService
    noop, // realtimeGateway
    noop, // emailService
    generalLedger, // generalLedger
  );
}

const po: any = {
  id: 10,
  branchId: 4,
  currency: 'ETB',
  items: [
    { id: 1, unitPrice: 100 },
    { id: 2, unitPrice: 50 },
  ],
};

const findLine = (entry: any, code: string) =>
  entry.lines.find((l: any) => l.accountCode === code);

describe('PurchaseOrdersService — goods-received ledger posting', () => {
  it('values a partial receipt at received quantity × unit price', async () => {
    const generalLedger = { post: jest.fn().mockResolvedValue({ id: 1 }) };
    const service = makeService(generalLedger);

    // Receive 3 of item 1 (@100), nothing of item 2 yet.
    const receiptSummary = [
      {
        itemId: 1,
        productId: 101,
        receivedQuantity: 3,
        shortageQuantity: 0,
        damagedQuantity: 0,
      },
      {
        itemId: 2,
        productId: 102,
        receivedQuantity: 0,
        shortageQuantity: 0,
        damagedQuantity: 0,
      },
    ];

    await (service as any).postReceiptEventToLedger(
      po,
      receiptSummary,
      'po-receipt-event-99',
      new Date('2026-07-01T00:00:00Z'),
    );

    expect(generalLedger.post).toHaveBeenCalledTimes(1);
    const entry = generalLedger.post.mock.calls[0][0];
    expect(entry.idempotencyKey).toBe('po-receipt-event-99');
    expect(findLine(entry, '1200').debit).toBe(300); // INVENTORY = 3 × 100
    expect(findLine(entry, '2000').credit).toBe(300); // SUPPLIER_PAYABLES
  });

  it('does not post when nothing was received in the event', async () => {
    const generalLedger = { post: jest.fn() };
    const service = makeService(generalLedger);

    await (service as any).postReceiptEventToLedger(
      po,
      [
        {
          itemId: 1,
          productId: 101,
          receivedQuantity: 0,
          shortageQuantity: 2,
          damagedQuantity: 1,
        },
      ],
      'po-receipt-event-100',
      new Date(),
    );

    expect(generalLedger.post).not.toHaveBeenCalled();
  });

  it('persistReceiptEvent posts the receipt atomically, keyed by the event id', async () => {
    const generalLedger = { post: jest.fn().mockResolvedValue({ id: 1 }) };
    const receiptEventsRepo = {
      create: (v: any) => v,
      save: jest.fn(async (v: any) => ({
        id: 77,
        createdAt: new Date('2026-07-02T00:00:00Z'),
        ...v,
      })),
    };
    const service = makeService(generalLedger, receiptEventsRepo);

    const receiptSummary = [
      {
        itemId: 1,
        productId: 101,
        receivedQuantity: 2,
        shortageQuantity: 0,
        damagedQuantity: 0,
      },
      {
        itemId: 2,
        productId: 102,
        receivedQuantity: 4,
        shortageQuantity: 0,
        damagedQuantity: 0,
      },
    ];

    await (service as any).persistReceiptEvent(
      po,
      receiptSummary,
      null,
      undefined,
      null,
    );

    expect(receiptEventsRepo.save).toHaveBeenCalled();
    const entry = generalLedger.post.mock.calls[0][0];
    expect(entry.idempotencyKey).toBe('po-receipt-event-77');
    expect(findLine(entry, '1200').debit).toBe(400); // 2×100 + 4×50
    expect(findLine(entry, '2000').credit).toBe(400);
  });
});

describe('PurchaseOrdersService — supplier inbox', () => {
  const makeSvc = ({
    poRepo = {},
    supplierRepo = {},
  }: any): PurchaseOrdersService => {
    const noop: any = {};
    return new PurchaseOrdersService(
      noop, // dataSource
      poRepo, // purchaseOrdersRepository
      noop, // branchesRepository
      supplierRepo, // supplierProfilesRepository
      noop, // productsRepository
      noop, // supplierOffersRepository
      noop, // purchaseOrderReceiptEventsRepository
      noop, // auditService
      noop, // inventoryLedgerService
      noop, // replenishmentService
      noop, // procurementWebhooksService
      noop, // realtimeGateway
      noop, // emailService
      noop, // generalLedger
    );
  };

  describe('findIncoming', () => {
    it('scopes to the caller’s resolved supplier profile and excludes drafts', async () => {
      const find = jest.fn().mockResolvedValue([{ id: 1 }]);
      const supplierRepo = { findOne: jest.fn().mockResolvedValue({ id: 55 }) };
      const service = makeSvc({ poRepo: { find }, supplierRepo });

      const result = await service.findIncoming({
        id: 9,
        roles: ['SUPPLIER_ACCOUNT'],
      });

      expect(supplierRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 9 },
        select: { id: true },
      });
      const where = find.mock.calls[0][0].where;
      expect(where.supplierProfileId).toBe(55);
      expect(where.status).toBeDefined(); // Not(DRAFT)
      expect(result).toEqual([{ id: 1 }]);
    });

    it('returns [] for a non-admin user without a supplier profile', async () => {
      const find = jest.fn();
      const service = makeSvc({
        poRepo: { find },
        supplierRepo: { findOne: jest.fn().mockResolvedValue(null) },
      });

      const result = await service.findIncoming({
        id: 9,
        roles: ['SUPPLIER_ACCOUNT'],
      });

      expect(result).toEqual([]);
      expect(find).not.toHaveBeenCalled();
    });

    it('gives SUPER_ADMIN a support view of every non-draft order', async () => {
      const find = jest.fn().mockResolvedValue([]);
      const service = makeSvc({
        poRepo: { find },
        supplierRepo: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await service.findIncoming({ id: 1, roles: ['SUPER_ADMIN'] });

      const where = find.mock.calls[0][0].where;
      expect(where.supplierProfileId).toBeUndefined();
      expect(where.status).toBeDefined();
    });
  });

  describe('updateSupplierStatus', () => {
    it('rejects a status other than ACKNOWLEDGED / SHIPPED', async () => {
      const service = makeSvc({});
      await expect(
        service.updateSupplierStatus(
          10,
          { status: PurchaseOrderStatus.RECEIVED } as any,
          { id: 9, roles: ['SUPPLIER_ACCOUNT'] },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a PO addressed to another supplier', async () => {
      const poRepo = {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 10, supplierProfileId: 999 }),
      };
      const supplierRepo = { findOne: jest.fn().mockResolvedValue({ id: 55 }) };
      const service = makeSvc({ poRepo, supplierRepo });

      await expect(
        service.updateSupplierStatus(
          10,
          { status: PurchaseOrderStatus.ACKNOWLEDGED },
          { id: 9, roles: ['SUPPLIER_ACCOUNT'] },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows the owning supplier and delegates to the shared status pipeline', async () => {
      const poRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 10, supplierProfileId: 55 }),
      };
      const supplierRepo = { findOne: jest.fn().mockResolvedValue({ id: 55 }) };
      const service = makeSvc({ poRepo, supplierRepo });
      const updateSpy = jest
        .spyOn(service, 'updateStatus')
        .mockResolvedValue({ id: 10, status: 'ACKNOWLEDGED' } as any);

      const dto = { status: PurchaseOrderStatus.ACKNOWLEDGED };
      const result = await service.updateSupplierStatus(10, dto, {
        id: 9,
        roles: ['SUPPLIER_ACCOUNT'],
        branchId: 7,
      });

      // branchId cleared so the re-load inside updateStatus is by id only.
      expect(updateSpy).toHaveBeenCalledWith(
        10,
        dto,
        expect.objectContaining({ id: 9, branchId: undefined }),
      );
      expect(result).toEqual({ id: 10, status: 'ACKNOWLEDGED' });
    });

    it('lets SUPER_ADMIN bypass the ownership check (support)', async () => {
      const poRepo = {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 10, supplierProfileId: 999 }),
      };
      const supplierRepo = { findOne: jest.fn() };
      const service = makeSvc({ poRepo, supplierRepo });
      const updateSpy = jest
        .spyOn(service, 'updateStatus')
        .mockResolvedValue({ id: 10 } as any);

      await service.updateSupplierStatus(
        10,
        { status: PurchaseOrderStatus.SHIPPED },
        { id: 1, roles: ['SUPER_ADMIN'] },
      );

      expect(supplierRepo.findOne).not.toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalled();
    });
  });
});
