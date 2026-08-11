import { BadRequestException, ConflictException } from '@nestjs/common';
import { PropertyRentalBookingService } from './property-rental-booking.service';
import {
  PropertyRentalBillingCycle,
  PropertyRentalBookingStatus,
  PropertyTenantType,
} from './entities/property-rental-booking.entity';

type RepoMock = {
  findOne: jest.Mock;
  find: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  increment: jest.Mock;
};

describe('PropertyRentalBookingService', () => {
  let service: PropertyRentalBookingService;
  let bookingRepo: RepoMock;
  let chargeRepo: RepoMock;
  let branchRepo: RepoMock;
  let generalLedger: {
    post: jest.Mock;
    reverse: jest.Mock;
    findEntryByIdempotencyKey: jest.Mock;
  };

  beforeEach(() => {
    bookingRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => ({ id: value.id ?? 501, ...value })),
      save: jest.fn(async (value) => ({
        id: value.id ?? 501,
        createdAt: value.createdAt ?? new Date('2026-06-01T08:00:00.000Z'),
        updatedAt: value.updatedAt ?? new Date('2026-06-01T08:00:00.000Z'),
        ...value,
      })),
      increment: jest.fn(async () => undefined),
    };
    chargeRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => ({ id: value.id ?? 9001, ...value })),
      save: jest.fn(async (value) => ({
        id: value.id ?? 9001,
        createdAt: value.createdAt ?? new Date('2026-06-01T09:00:00.000Z'),
        ...value,
      })),
      increment: jest.fn(),
    };
    generalLedger = {
      post: jest.fn().mockResolvedValue({ id: 1 }),
      reverse: jest.fn().mockResolvedValue(null),
      findEntryByIdempotencyKey: jest.fn().mockResolvedValue(null),
    };
    // Tax off by default so the existing gross-figure expectations still read as
    // they always did; the tax tests below open a booking on a taxed branch.
    branchRepo = {
      findOne: jest.fn(async () => ({
        id: 3,
        taxEnabled: false,
        taxRate: 0.15,
      })),
    } as never;
    service = new PropertyRentalBookingService(
      bookingRepo as never,
      chargeRepo as never,
      branchRepo as never,
      generalLedger as never,
    );
  });

  describe('openBooking', () => {
    it('computes month-based periodsBilled from the lease span', async () => {
      const result = await service.openBooking({
        branchId: 4,
        propertyCode: 'APT-3B',
        renterName: 'Abdi',
        leaseStartAt: '2026-06-01',
        leaseEndAt: '2026-09-01',
        billingCycle: 'MONTH',
        depositAmount: 5000,
      });

      expect(result.periodsBilled).toBe(3);
      expect(result.billingCycle).toBe(PropertyRentalBillingCycle.MONTH);
      expect(result.depositAmount).toBe(5000);
      expect(result.status).toBe(PropertyRentalBookingStatus.OPEN);
    });

    it('defaults tenantType to INDIVIDUAL and normalizes BUSINESS', async () => {
      const individual = await service.openBooking({
        branchId: 4,
        propertyCode: 'APT-1',
        renterName: 'Abdi',
      });
      expect(individual.tenantType).toBe(PropertyTenantType.INDIVIDUAL);

      const business = await service.openBooking({
        branchId: 4,
        propertyCode: 'APT-2',
        renterName: 'Acme Ltd',
        tenantType: 'business',
      });
      expect(business.tenantType).toBe(PropertyTenantType.BUSINESS);
    });

    it('is idempotent on a repeated idempotencyKey', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 77,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        propertyCode: 'APT-3B',
        tenantType: PropertyTenantType.INDIVIDUAL,
        billingCycle: PropertyRentalBillingCycle.MONTH,
        periodsBilled: 2,
        currency: 'ETB',
        depositAmount: 0,
        chargesTotal: 0,
        depositRefund: null,
        paidAmount: null,
        areaSqm: null,
        createdAt: new Date('2026-06-01T08:00:00.000Z'),
        updatedAt: new Date('2026-06-01T08:00:00.000Z'),
        settledAt: null,
        voidedAt: null,
      });

      const result = await service.openBooking({
        branchId: 4,
        propertyCode: 'APT-3B',
        renterName: 'Abdi',
        idempotencyKey: 'dup-key-1',
      });

      expect(result.id).toBe(77);
      expect(bookingRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('postCharge', () => {
    it('rejects charges on a non-open booking', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 1,
        status: PropertyRentalBookingStatus.SETTLED,
      });
      await expect(
        service.postCharge(1, { chargeName: 'Rent', amount: 5000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('posts a charge and increments the running total', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 1,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        currency: 'ETB',
      });
      chargeRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.postCharge(1, {
        chargeGroupCode: 'rent',
        chargeName: 'Monthly Rent',
        amount: 5000,
        quantity: 2,
        recurring: true,
      });

      expect(result.chargeGroupCode).toBe('RENT');
      expect(result.amount).toBe(5000);
      expect(result.recurring).toBe(true);
      expect(bookingRepo.increment).toHaveBeenCalledWith(
        { id: 1 },
        'chargesTotal',
        10000,
      );
    });
  });

  describe('settleBooking', () => {
    it('sums payments and records the deposit refund', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 1,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        currency: 'ETB',
        depositAmount: 5000,
        chargesTotal: 18000,
      });

      const result = await service.settleBooking(1, {
        payments: [
          { method: 'CASH', amount: 10000 },
          { method: 'CARD', amount: 8000 },
        ],
        depositRefund: 1500,
      });

      expect(result.status).toBe(PropertyRentalBookingStatus.SETTLED);
      expect(result.paidAmount).toBe(18000);
      expect(result.depositRefund).toBe(1500);
      expect(result.settledAt).not.toBeNull();
    });

    it('is idempotent when already settled', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 1,
        branchId: 4,
        status: PropertyRentalBookingStatus.SETTLED,
        currency: 'ETB',
        depositAmount: 0,
        chargesTotal: 0,
        depositRefund: null,
        paidAmount: 5000,
        areaSqm: null,
        billingCycle: PropertyRentalBillingCycle.MONTH,
        periodsBilled: 1,
        tenantType: PropertyTenantType.INDIVIDUAL,
        createdAt: new Date('2026-06-01T08:00:00.000Z'),
        updatedAt: new Date('2026-06-01T08:00:00.000Z'),
        settledAt: new Date('2026-06-02T08:00:00.000Z'),
        voidedAt: null,
      });

      const result = await service.settleBooking(1, { paidAmount: 999 });
      expect(result.paidAmount).toBe(5000);
      expect(bookingRepo.save).not.toHaveBeenCalled();
    });

    it('accumulates a prior partial payment into the final settlement total', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 1,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        currency: 'ETB',
        depositAmount: 0,
        chargesTotal: 84000,
        paidAmount: 30000,
        payments: [
          {
            amount: 30000,
            method: 'CASH',
            currency: 'ETB',
            reference: null,
            checkoutId: 'chk-1',
            idempotencyKey: 'pay-1',
            paidAt: '2026-06-08T00:00:00.000Z',
          },
        ],
      });

      const result = await service.settleBooking(1, {
        payments: [{ method: 'CASH', amount: 54000 }],
      });

      expect(result.paidAmount).toBe(84000);
      expect(result.outstanding).toBe(0);
      expect(result.payments).toHaveLength(2);
    });
  });

  describe('recordPayment', () => {
    const openBooking = (over = {}) => ({
      id: 1,
      branchId: 4,
      status: PropertyRentalBookingStatus.OPEN,
      currency: 'ETB',
      chargesTotal: 84000,
      paidAmount: null,
      payments: null,
      depositAmount: 0,
      depositRefund: null,
      areaSqm: null,
      tenantType: PropertyTenantType.INDIVIDUAL,
      billingCycle: PropertyRentalBillingCycle.MONTH,
      periodsBilled: 6,
      ...over,
    });

    it('records a partial instalment, accrues paidAmount and exposes outstanding', async () => {
      bookingRepo.findOne.mockResolvedValueOnce(openBooking());

      const result = await service.recordPayment(1, {
        payments: [{ method: 'CASH', amount: 30000 }],
        checkoutId: 'chk-1',
        idempotencyKey: 'pay-1',
      });

      expect(result.status).toBe(PropertyRentalBookingStatus.OPEN);
      expect(result.paidAmount).toBe(30000);
      expect(result.outstanding).toBe(54000);
      expect(result.payments).toHaveLength(1);
      expect(result.payments[0]).toMatchObject({
        amount: 30000,
        method: 'CASH',
        checkoutId: 'chk-1',
      });
    });

    it('is idempotent on a repeated payment idempotencyKey', async () => {
      bookingRepo.findOne.mockResolvedValueOnce(
        openBooking({
          paidAmount: 30000,
          payments: [
            {
              amount: 30000,
              method: 'CASH',
              currency: 'ETB',
              reference: null,
              checkoutId: 'chk-1',
              idempotencyKey: 'pay-1',
              paidAt: '2026-06-08T00:00:00.000Z',
            },
          ],
          createdAt: new Date('2026-06-01T08:00:00.000Z'),
          updatedAt: new Date('2026-06-01T08:00:00.000Z'),
          settledAt: null,
          voidedAt: null,
        }),
      );

      const result = await service.recordPayment(1, {
        payments: [{ method: 'CASH', amount: 30000 }],
        idempotencyKey: 'pay-1',
      });

      expect(result.paidAmount).toBe(30000);
      expect(bookingRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a payment on a non-open booking', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 1,
        status: PropertyRentalBookingStatus.SETTLED,
      });
      await expect(
        service.recordPayment(1, { amount: 1000 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('voidBooking', () => {
    it('blocks voiding a settled booking', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 1,
        status: PropertyRentalBookingStatus.SETTLED,
      });
      await expect(service.voidBooking(1, {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('transferUnit', () => {
    it('moves the booking to a new property code and records the previous one', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 1,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        propertyCode: 'APT-3B',
        currency: 'ETB',
        tenantType: PropertyTenantType.INDIVIDUAL,
        billingCycle: PropertyRentalBillingCycle.MONTH,
      });

      const result = await service.transferUnit(1, {
        newPropertyCode: 'APT-5A',
      });

      expect(result.propertyCode).toBe('APT-5A');
      expect(result.transferredToProperty).toBe('APT-3B');
    });
  });

  describe('general-ledger posting', () => {
    const findEntry = (sourceType: string) =>
      generalLedger.post.mock.calls
        .map((c) => c[0])
        .find((e) => e.sourceType === sourceType);
    const findLine = (entry: any, code: string) =>
      entry.lines.find((l: any) => l.accountCode === code);

    it('posts the security deposit held at move-in (Dr Cash / Cr Customer deposits)', async () => {
      await service.openBooking({
        branchId: 4,
        propertyCode: 'APT-3B',
        depositAmount: 2000,
        currency: 'ETB',
      });

      const entry = findEntry('DEPOSIT_OPEN');
      expect(entry).toBeTruthy();
      expect(findLine(entry, '1000').debit).toBe(2000); // CASH
      expect(findLine(entry, '2300').credit).toBe(2000); // CUSTOMER_DEPOSITS
    });

    it('defers rent collected on an open booking (Cr Deferred revenue)', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 501,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        currency: 'ETB',
        paidAmount: 0,
        payments: [],
        leaseStartAt: '2026-06-01',
      });

      await service.recordPayment(501, {
        payments: [{ method: 'CASH', amount: 1000 }],
      });

      const entry = findEntry('HOSPITALITY_PAYMENT');
      expect(entry).toBeTruthy();
      expect(findLine(entry, '1000').debit).toBe(1000); // CASH
      expect(findLine(entry, '2400').credit).toBe(1000); // DEFERRED_REVENUE
    });

    it('recognizes deferred + final rent and clears the deposit at settlement', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 501,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        currency: 'ETB',
        paidAmount: 1000, // a prior instalment, already deferred
        payments: [{ method: 'CASH', amount: 1000 }],
        leaseStartAt: '2026-06-01',
        depositAmount: 2000,
      });

      await service.settleBooking(501, {
        payments: [{ method: 'CASH', amount: 500 }],
        depositHeld: 2000,
        depositRefund: 1500,
        depositForfeit: 500,
      });

      const settle = findEntry('HOSPITALITY_SETTLEMENT');
      expect(findLine(settle, '4100').credit).toBe(1500); // RENTAL_REVENUE = 1000 + 500
      expect(findLine(settle, '2400').debit).toBe(1000); // reclassify prior deferral
      expect(findLine(settle, '1000').debit).toBe(500); // final cash

      const refund = findEntry('DEPOSIT_REFUND');
      expect(findLine(refund, '2300').debit).toBe(1500); // CUSTOMER_DEPOSITS
      expect(findLine(refund, '1000').credit).toBe(1500); // CASH out

      const forfeit = findEntry('DEPOSIT_FORFEIT');
      expect(findLine(forfeit, '2300').debit).toBe(500);
      expect(findLine(forfeit, '4100').credit).toBe(500); // forfeit recognized as income
    });

    it('does not post a deposit refund/forfeit larger than the deposit held', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 503,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        currency: 'ETB',
        depositAmount: 0, // no deposit was ever held/opened
        paidAmount: 0,
        payments: [],
        leaseStartAt: '2026-06-01',
      });

      await service.settleBooking(503, {
        payments: [{ method: 'CASH', amount: 500 }],
        depositRefund: 400, // a client sends a refund despite no held deposit
        depositForfeit: 100,
      });

      // Clamped to the held amount (0) → no CUSTOMER_DEPOSITS debit can occur.
      expect(findEntry('DEPOSIT_REFUND')).toBeUndefined();
      expect(findEntry('DEPOSIT_FORFEIT')).toBeUndefined();
    });

    it('does not re-recognize rent already recognized by the accrual job', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 502,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        currency: 'ETB',
        paidAmount: 1000, // all collected so far
        recognizedAmount: 1000, // ...and the accrual job already recognized it
        payments: [{ method: 'CASH', amount: 1000 }],
        leaseStartAt: '2026-06-01',
      });

      await service.settleBooking(502, {
        payments: [{ method: 'CASH', amount: 500 }], // a final instalment
      });

      const settle = findEntry('HOSPITALITY_SETTLEMENT');
      // Only the final 500 is newly recognized; the prior 1000 is not double-counted.
      expect(findLine(settle, '4100').credit).toBe(500);
      expect(findLine(settle, '2400')).toBeUndefined(); // no deferred reclassification
      expect(findLine(settle, '1000').debit).toBe(500);
    });
  });

  describe('tax on rent', () => {
    const findEntry = (sourceType: string) =>
      generalLedger.post.mock.calls
        .map((c) => c[0])
        .find((e) => e.sourceType === sourceType);
    const findLine = (entry: any, code: string) =>
      entry.lines.find((l: any) => l.accountCode === code);
    const sum = (entry: any, side: 'debit' | 'credit') =>
      Math.round(
        entry.lines.reduce(
          (total: number, line: any) => total + Number(line[side] || 0),
          0,
        ) * 100,
      ) / 100;

    const taxedBranch = () => {
      branchRepo.findOne = jest.fn(async () => ({
        id: 4,
        taxEnabled: true,
        taxRate: 0.15,
      })) as never;
    };

    it('stamps the branch rate on the lease when it is opened', async () => {
      taxedBranch();
      await service.openBooking({
        branchId: 4,
        propertyCode: 'APT-3B',
        currency: 'ETB',
      });
      expect(bookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ taxRate: 0.15 }),
      );
    });

    it('stamps zero when the branch is not charging tax', async () => {
      await service.openBooking({
        branchId: 4,
        propertyCode: 'APT-3B',
        currency: 'ETB',
      });
      expect(bookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ taxRate: 0 }),
      );
    });

    it('credits the tax on an instalment straight to tax payable, not to deferred rent', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 501,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        currency: 'ETB',
        paidAmount: 0,
        payments: [],
        leaseStartAt: '2026-06-01',
        taxRate: 0.15,
      });

      await service.recordPayment(501, {
        payments: [{ method: 'CASH', amount: 1150 }],
      });

      const entry = findEntry('HOSPITALITY_PAYMENT');
      expect(findLine(entry, '1000').debit).toBe(1150); // CASH — gross, as taken
      expect(findLine(entry, '2100').credit).toBe(150); // TAX_PAYABLE
      expect(findLine(entry, '2400').credit).toBe(1000); // DEFERRED_REVENUE — net
      expect(sum(entry, 'debit')).toBe(sum(entry, 'credit'));
    });

    it('taxes only the final payment at settlement — the deferred half was taxed when collected', async () => {
      bookingRepo.findOne.mockResolvedValueOnce({
        id: 501,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        currency: 'ETB',
        paidAmount: 1150, // a prior instalment: 1000 net + 150 tax, already deferred
        payments: [{ method: 'CASH', amount: 1150 }],
        leaseStartAt: '2026-06-01',
        taxRate: 0.15,
      });

      await service.settleBooking(501, {
        payments: [{ method: 'CASH', amount: 575 }], // 500 net + 75 tax
      });

      const settle = findEntry('HOSPITALITY_SETTLEMENT');
      expect(findLine(settle, '1000').debit).toBe(575); // CASH — gross
      expect(findLine(settle, '2400').debit).toBe(1000); // DEFERRED drawn down NET
      expect(findLine(settle, '2100').credit).toBe(75); // only the final payment's tax
      expect(findLine(settle, '4100').credit).toBe(1500); // RENTAL_REVENUE — net of both
      expect(sum(settle, 'debit')).toBe(sum(settle, 'credit'));
    });

    it('leaves deferred revenue at exactly zero across collect → recognize → settle', async () => {
      // The invariant that matters: every birr credited to deferred revenue when
      // rent was collected must be debited back out by recognition and
      // settlement. Netting one side but not the other strands the tax there
      // permanently, which is what posting gross recognition against a net
      // deferral would do.
      const rate = 0.15;
      const instalment = 1150;
      const finalPayment = 575;

      bookingRepo.findOne.mockResolvedValueOnce({
        id: 700,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        currency: 'ETB',
        paidAmount: 0,
        payments: [],
        leaseStartAt: '2026-06-01',
        taxRate: rate,
      });
      await service.recordPayment(700, {
        payments: [{ method: 'CASH', amount: instalment }],
      });
      const deferredIn = findLine(
        findEntry('HOSPITALITY_PAYMENT'),
        '2400',
      ).credit;

      // The accrual job recognizes part of it, then move-out clears the rest.
      const recognizedGross = 400;
      const recognizedNet =
        Math.round((recognizedGross / (1 + rate)) * 100) / 100;

      bookingRepo.findOne.mockResolvedValueOnce({
        id: 700,
        branchId: 4,
        status: PropertyRentalBookingStatus.OPEN,
        currency: 'ETB',
        paidAmount: instalment,
        recognizedAmount: recognizedGross,
        payments: [{ method: 'CASH', amount: instalment }],
        leaseStartAt: '2026-06-01',
        taxRate: rate,
      });
      await service.settleBooking(700, {
        payments: [{ method: 'CASH', amount: finalPayment }],
      });
      const deferredOutAtSettle = findLine(
        findEntry('HOSPITALITY_SETTLEMENT'),
        '2400',
      ).debit;

      // recognition (net) + settlement (net) === everything ever deferred
      expect(
        Math.round((recognizedNet + deferredOutAtSettle) * 100) / 100,
      ).toBe(deferredIn);
    });
  });
});
