import { Test } from '@nestjs/testing';
import { FavoritesService } from './favorites.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Favorite } from './entities/favorite.entity';
import { Product } from '../products/entities/product.entity';

function createMockRepo<T extends object>(seed: Partial<T>[] = []) {
  const items = new Map<any, any>();
  return {
    findOne: async ({ where }: any) => items.get(where.userId) || null,
    save: async (obj: any) => {
      items.set(obj.userId, {
        ...obj,
        updatedAt: new Date(),
        createdAt: obj.createdAt ?? new Date(),
      });
      return items.get(obj.userId);
    },
    create: (obj: any) => ({
      ...obj,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    find: async ({ where }: any) => {
      const ids = where.id.value as number[];
      // pretend all ids 1..100 exist
      return ids
        .filter((id) => id >= 1 && id <= 100)
        .map((id) => ({ id })) as any;
    },
  } as any;
}

describe('FavoritesService', () => {
  let service: FavoritesService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FavoritesService,
        {
          provide: getRepositoryToken(Favorite),
          useValue: createMockRepo<Favorite>(),
        },
        {
          provide: getRepositoryToken(Product),
          useValue: createMockRepo<Product>(),
        },
      ],
    }).compile();
    service = moduleRef.get(FavoritesService);
  });

  it('ensures row and empty state', async () => {
    const res = await service.get(1, false);
    expect(res.ids).toEqual([]);
    expect(res.version).toBe(0);
  });

  it('add/duplicate/order and remove', async () => {
    const userId = 2;
    const p1 = await service.patch(userId, { add: [1, 2, 3] });
    expect(p1.ids).toEqual([1, 2, 3]);
    const p2 = await service.patch(userId, { add: [2, 4] });
    expect(p2.ids).toEqual([1, 2, 3, 4]);
    const p3 = await service.patch(userId, { remove: [2, 9] });
    expect(p3.ids).toEqual([1, 3, 4]);
  });

  it('put replace and etag/version bump', async () => {
    const userId = 3;
    const a = await service.put(userId, { ids: [5, 6, 5] });
    expect(a.ids).toEqual([5, 6]);
    const etag1 = a.etag;
    const b = await service.put(userId, { ids: [6, 5] });
    expect(b.ids).toEqual([6, 5]);
    expect(b.etag).not.toEqual(etag1);
  });

  it('contains returns mapping', async () => {
    const userId = 4;
    await service.put(userId, { ids: [7, 8] });
    const map = await service.contains(userId, [6, 7, 8, 9]);
    expect(map['7']).toBe(true);
    expect(map['6']).toBe(false);
  });

  it('If-Match 412', async () => {
    const userId = 5;
    const g = await service.get(userId, false);
    await service.put(userId, { ids: [1] });
    await expect(
      service.put(userId, { ids: [2] }, 'W/"fav-0-deadbeef"'),
    ).rejects.toBeTruthy();
  });
});
