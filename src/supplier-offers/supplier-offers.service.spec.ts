import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SupplierOffersService } from './supplier-offers.service';
import { SupplierOfferStatus } from './entities/supplier-offer.entity';

function makeService({
  offers = {},
  profiles = {},
  products = {},
} = {}): SupplierOffersService {
  return new SupplierOffersService(
    offers as any,
    profiles as any,
    products as any,
  );
}

describe('SupplierOffersService', () => {
  it('listForUser requires a supplier profile', async () => {
    const service = makeService({
      profiles: { findOne: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.listForUser(7)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('createForUser validates the product exists', async () => {
    const service = makeService({
      profiles: { findOne: jest.fn().mockResolvedValue({ id: 55 }) },
      products: { findOne: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      service.createForUser(7, { productId: 9, unitWholesalePrice: 5 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createForUser stores a DRAFT offer scoped to the profile', async () => {
    const offers = {
      create: (v: any) => v,
      save: jest.fn(async (v: any) => ({ id: 1, ...v })),
    };
    const service = makeService({
      offers,
      profiles: { findOne: jest.fn().mockResolvedValue({ id: 55 }) },
      products: { findOne: jest.fn().mockResolvedValue({ id: 9 }) },
    });
    const result = await service.createForUser(7, {
      productId: 9,
      unitWholesalePrice: 5,
    });
    expect(result.supplierProfileId).toBe(55);
    expect(result.status).toBe(SupplierOfferStatus.DRAFT);
  });

  it('rejects updates to another supplier’s offer', async () => {
    const service = makeService({
      offers: {
        findOne: jest.fn().mockResolvedValue({ id: 1, supplierProfileId: 999 }),
      },
      profiles: { findOne: jest.fn().mockResolvedValue({ id: 55 }) },
    });
    await expect(
      service.updateForUser(7, 1, { moq: 2 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('publish refuses a non-approved supplier', async () => {
    const offers = {
      findOne: jest.fn().mockResolvedValue({ id: 1, supplierProfileId: 55 }),
      save: jest.fn(async (v: any) => v),
    };
    const profiles = {
      findOne: jest
        .fn()
        // resolveProfileOrThrow (by userId), then the publish profile lookup (by id)
        .mockResolvedValueOnce({
          id: 55,
          onboardingStatus: 'PENDING_REVIEW',
          isActive: true,
        })
        .mockResolvedValueOnce({
          id: 55,
          onboardingStatus: 'PENDING_REVIEW',
          isActive: true,
        }),
    };
    const service = makeService({ offers, profiles });
    await expect(service.publishForUser(7, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('publish flips an approved supplier’s offer to PUBLISHED', async () => {
    const offers = {
      findOne: jest.fn().mockResolvedValue({ id: 1, supplierProfileId: 55 }),
      save: jest.fn(async (v: any) => v),
    };
    const profiles = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          id: 55,
          onboardingStatus: 'APPROVED',
          isActive: true,
        })
        .mockResolvedValueOnce({
          id: 55,
          onboardingStatus: 'APPROVED',
          isActive: true,
        }),
    };
    const service = makeService({ offers, profiles });
    const result = await service.publishForUser(7, 1);
    expect(result.status).toBe(SupplierOfferStatus.PUBLISHED);
  });

  it('archive flips status to ARCHIVED', async () => {
    const offers = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        supplierProfileId: 55,
        status: 'PUBLISHED',
      }),
      save: jest.fn(async (v: any) => v),
    };
    const profiles = { findOne: jest.fn().mockResolvedValue({ id: 55 }) };
    const service = makeService({ offers, profiles });
    const result = await service.archiveForUser(7, 1);
    expect(result.status).toBe(SupplierOfferStatus.ARCHIVED);
  });
});
