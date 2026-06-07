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
    service = new PropertyRentalBookingService(
      bookingRepo as never,
      chargeRepo as never,
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
});
