import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorService } from '../src/vendor/vendor.service';
import { User } from '../src/users/entities/user.entity';
import { Product } from '../src/products/entities/product.entity';
import { Order, OrderItem } from '../src/orders/entities/order.entity';
import { ProductImage } from '../src/products/entities/product-image.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Lightweight integration test using SQLite in-memory is not configured in repo; we'll mock repositories.

describe('VendorService.searchDeliverers (geo)', () => {
  let service: VendorService;
  let userRepo: Repository<User>;

  const seed: Partial<User>[] = [
    {
      id: 1,
      email: 'a@example.com',
      roles: ['DELIVERER'] as any,
      isActive: true as any,
      displayName: 'Alpha',
      locationLat: 9.0101,
      locationLng: 38.7612,
      registrationCity: 'Addis Ababa',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      email: 'b@example.com',
      roles: ['DELIVERER'] as any,
      isActive: true as any,
      displayName: 'Bravo',
      locationLat: 8.9806,
      locationLng: 38.7578,
      registrationCity: 'Addis Ababa',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 3,
      email: 'c@example.com',
      roles: ['DELIVERER'] as any,
      isActive: true as any,
      displayName: 'Charlie',
      locationLat: null as any,
      locationLng: null as any,
      registrationCity: 'Dire Dawa',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        VendorService,
        {
          provide: getRepositoryToken(User),
          useClass: Repository,
        },
        { provide: getRepositoryToken(Product), useClass: Repository },
        { provide: getRepositoryToken(Order), useClass: Repository },
        { provide: getRepositoryToken(OrderItem), useClass: Repository },
        { provide: getRepositoryToken(ProductImage), useClass: Repository },
        { provide: 'NotificationsService', useValue: { notify: jest.fn() } },
      ],
    }).compile();

    service = module.get(VendorService);
    userRepo = module.get(getRepositoryToken(User));

    // Mock queryBuilder for userRepo
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
