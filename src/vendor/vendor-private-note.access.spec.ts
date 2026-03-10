import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VendorService } from './vendor.service';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Order, OrderItem } from '../orders/entities/order.entity';
import { Dispute } from '../orders/entities/dispute.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { ProductImpression } from '../products/entities/product-impression.entity';
import { UserReport } from '../moderation/entities/user-report.entity';
import { Tag } from '../tags/tag.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { DoSpacesService } from '../media/do-spaces.service';
import { CurrencyService } from '../common/services/currency.service';
import { ShippingService } from '../shipping/shipping.service';
import { SettingsService } from '../settings/settings.service';
import { EmailService } from '../email/email.service';
import { toProductCard } from '../products/utils/product-card.util';

describe('Vendor private note access rules', () => {
  let service: VendorService;

  const productRepoMock: any = {};
  const userRepoMock: any = {};
  const orderRepoMock: any = {};
  const orderItemRepoMock: any = {};
  const productImageRepoMock: any = {};
  const tagRepoMock: any = {};
  const impressionRepoMock: any = {};

  const makeNoteQb = (row: any) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(async () => row),
  });

  beforeEach(async () => {
    jest.resetAllMocks();

    Object.assign(productRepoMock, {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      save: jest.fn(async (v: any) => v),
      createQueryBuilder: jest.fn(),
      query: jest.fn(async () => [{ '?column?': 1 }]),
      manager: {
        getRepository: jest.fn(() => ({
          findOne: jest.fn(async () => null),
        })),
      },
    });
    Object.assign(userRepoMock, { findOneBy: jest.fn() });
    Object.assign(orderRepoMock, {
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
    });
    Object.assign(orderItemRepoMock, {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    });
    Object.assign(productImageRepoMock, {
      find: jest.fn(async () => []),
      save: jest.fn(),
      delete: jest.fn(),
      create: jest.fn((v: any) => v),
    });
    Object.assign(tagRepoMock, {
      find: jest.fn(async () => []),
      save: jest.fn(),
    });
    Object.assign(impressionRepoMock, { find: jest.fn(async () => []) });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorService,
        { provide: getRepositoryToken(User), useValue: userRepoMock },
        { provide: getRepositoryToken(Product), useValue: productRepoMock },
        { provide: getRepositoryToken(Order), useValue: orderRepoMock },
        { provide: getRepositoryToken(Dispute), useValue: {} },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepoMock },
        {
          provide: getRepositoryToken(ProductImage),
          useValue: productImageRepoMock,
        },
        { provide: getRepositoryToken(Tag), useValue: tagRepoMock },
        {
          provide: getRepositoryToken(ProductImpression),
          useValue: impressionRepoMock,
        },
        { provide: getRepositoryToken(UserReport), useValue: {} },
        {
          provide: NotificationsService,
          useValue: { createAndDispatch: jest.fn() },
        },
        {
          provide: DoSpacesService,
          useValue: {
            extractKeyFromUrl: jest.fn(),
            buildPublicUrl: jest.fn(),
            getSignedUrl: jest.fn(),
          },
        },
        {
          provide: CurrencyService,
          useValue: { convert: jest.fn(), getRate: jest.fn() },
        },
        { provide: ShippingService, useValue: { generateLabel: jest.fn() } },
        { provide: SettingsService, useValue: { getSystemSetting: jest.fn() } },
        { provide: EmailService, useValue: { sendEmail: jest.fn() } },
      ],
    }).compile();

    service = module.get<VendorService>(VendorService);
  });

  it('owner can write private note on update', async () => {
    const vendorId = 17;
    const productId = 88;
    const now = new Date('2026-02-28T09:30:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const existing: any = {
      id: productId,
      vendor: {
        id: vendorId,
        displayName: 'Vendor Owner',
        email: 'owner@suuq.test',
      },
      attributes: {},
    };

    productRepoMock.findOne.mockResolvedValue(existing);
    productRepoMock.findOneOrFail.mockImplementation(async () => ({
      ...existing,
      privateNote: existing.privateNote,
      privateNoteUpdatedById: existing.privateNoteUpdatedById,
      privateNoteUpdatedByName: existing.privateNoteUpdatedByName,
      privateNoteUpdatedAt: existing.privateNoteUpdatedAt,
    }));

    const result: any = await service.updateMyProduct(
      vendorId,
      productId,
      { privateNote: 'Restock from supplier C this week' } as any,
      { id: 501, displayName: 'Staff A', email: 'staff.a@suuq.test' } as any,
    );

    expect(productRepoMock.save).toHaveBeenCalled();
    expect(existing.privateNote).toBe('Restock from supplier C this week');
    expect(existing.privateNoteUpdatedById).toBe(501);
    expect(existing.privateNoteUpdatedByName).toBe('Staff A');
    expect(existing.privateNoteUpdatedAt).toEqual(now);
    expect(result.privateNote).toBe('Restock from supplier C this week');

    jest.useRealTimers();
  });

  it('owner can read private note from getMyProduct', async () => {
    const vendorId = 17;
    const productId = 88;

    productRepoMock.findOne.mockResolvedValue({
      id: productId,
      vendor: { id: vendorId },
      images: [],
      category: null,
      tags: [],
      attributes: {},
    });
    productRepoMock.createQueryBuilder.mockReturnValue(
      makeNoteQb({
        private_note: 'Need better product photos',
        private_note_updated_at: '2026-02-28T08:00:00.000Z',
        private_note_updated_by_id: '501',
        private_note_updated_by_name: 'Staff A',
      }),
    );

    const result: any = await service.getMyProduct(vendorId, productId);

    expect(result.privateNote).toBe('Need better product photos');
    expect(result.hasInternalNote).toBe(true);
    expect(result.privateNoteUpdatedById).toBe(501);
    expect(result.privateNoteUpdatedByName).toBe('Staff A');
    expect(result.privateNoteUpdatedAt).toEqual(
      new Date('2026-02-28T08:00:00.000Z'),
    );
  });

  it('public product card payload never includes private note fields', () => {
    const card = toProductCard({
      id: 1,
      name: 'Public Product',
      price: 100,
      currency: 'ETB',
      createdAt: new Date('2026-02-28T00:00:00.000Z'),
      privateNote: 'internal only',
      privateNoteUpdatedById: 123,
      privateNoteUpdatedByName: 'Hidden User',
      privateNoteUpdatedAt: new Date('2026-02-28T00:00:00.000Z'),
      vendor: { id: 10 },
    } as any);

    expect((card as any).privateNote).toBeUndefined();
    expect((card as any).privateNoteUpdatedById).toBeUndefined();
    expect((card as any).privateNoteUpdatedByName).toBeUndefined();
    expect((card as any).privateNoteUpdatedAt).toBeUndefined();
  });
});
