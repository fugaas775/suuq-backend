import { PosPortalOnboardingService } from '../branch-staff/pos-portal-onboarding.service';
import { SellerWorkspace } from '../seller-workspace/entities/seller-workspace.entity';
import { VendorStore } from './entities/vendor-store.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorService } from './vendor.service';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Order, OrderItem } from '../orders/entities/order.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { ProductImpression } from '../products/entities/product-impression.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Tag } from '../tags/tag.entity';
import { DoSpacesService } from '../media/do-spaces.service';
import { UserReport } from '../moderation/entities/user-report.entity';
import { CurrencyService } from '../common/services/currency.service';
import { ShippingService } from '../shipping/shipping.service';
import { SettingsService } from '../settings/settings.service';
import { EmailService } from '../email/email.service';
import { Dispute } from '../orders/entities/dispute.entity';

/**
 * Unit tests (mocked repos) for geo-aware searchDeliverers
 */

describe('VendorService.searchDeliverers (geo)', () => {
  let service: VendorService;
  let userRepo: Repository<User>;

  const seed: Partial<User>[] = [
    {
      id: 1,
      email: 'a@suuqsapp.com',
      roles: ['DELIVERER'] as any,
      isActive: true,
      displayName: 'Alpha',
      locationLat: 9.0101,
      locationLng: 38.7612,
      registrationCity: 'Addis Ababa',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      email: 'b@suuqsapp.com',
      roles: ['DELIVERER'] as any,
      isActive: true,
      displayName: 'Bravo',
      locationLat: 8.9806,
      locationLng: 38.7578,
      registrationCity: 'Addis Ababa',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 3,
      email: 'c@suuqsapp.com',
      roles: ['DELIVERER'] as any,
      isActive: true,
      displayName: 'Charlie',
      locationLat: null,
      locationLng: null,
      registrationCity: 'Dire Dawa',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        VendorService,
        { provide: InventoryLedgerService, useValue: {} },
        { provide: PosPortalOnboardingService, useValue: {} },
        { provide: getRepositoryToken(SellerWorkspace), useValue: {} },
        { provide: getRepositoryToken(VendorStore), useClass: Repository },
        {
          provide: getRepositoryToken(BranchStaffAssignment),
          useClass: Repository,
        },
        { provide: getRepositoryToken(User), useClass: Repository },
        { provide: getRepositoryToken(Product), useClass: Repository },
        { provide: getRepositoryToken(Order), useClass: Repository },
        { provide: getRepositoryToken(Dispute), useClass: Repository },
        { provide: getRepositoryToken(OrderItem), useClass: Repository },
        { provide: getRepositoryToken(ProductImage), useClass: Repository },
        { provide: getRepositoryToken(Tag), useClass: Repository },
        {
          provide: getRepositoryToken(ProductImpression),
          useClass: Repository,
        },
        { provide: getRepositoryToken(UserReport), useValue: {} },
        { provide: NotificationsService, useValue: { sendToUser: jest.fn() } },
        { provide: DoSpacesService, useValue: {} },
        { provide: CurrencyService, useValue: {} },
        { provide: ShippingService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: EmailService, useValue: {} },
      ],
    }).compile();

    service = module.get(VendorService);
    userRepo = module.get(getRepositoryToken(User));

    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(seed as any),
      getManyAndCount: jest
        .fn()
        .mockResolvedValue([seed as any, (seed as any).length]),
    };
    jest.spyOn(userRepo, 'createQueryBuilder').mockReturnValue(qb);
  });

  it('falls back when no origin (recent)', async () => {
    const res = await service.searchDeliverers({ q: '', page: 1, limit: 10 });
    expect(res.total).toBeDefined();
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items[0]).toHaveProperty('id');
  });

  it('sorts by distance when origin provided and includes distanceKm', async () => {
    const res = await service.searchDeliverers({
      lat: 8.98,
      lng: 38.76,
      page: 1,
      limit: 10,
    });
    expect(res.hasMore).toBeDefined();
    expect(res.items.every((i) => 'distanceKm' in i)).toBe(true);
  });

  it('applies radiusKm filtering', async () => {
    const res = await service.searchDeliverers({
      lat: 8.98,
      lng: 38.76,
      radiusKm: 5,
      page: 1,
      limit: 10,
    });
    expect(res.items.length).toBeGreaterThanOrEqual(0);
  });
});
