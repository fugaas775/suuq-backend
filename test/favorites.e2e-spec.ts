import { INestApplication, ValidationPipe, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RequiredHeadersGuard } from '../src/common/guards/required-headers.guard';
import { FavoritesService } from '../src/favorites/favorites.service';

class AllowGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    req.user = { id: 1, email: 'test@example.com', roles: ['CUSTOMER'] };
    return true;
  }
}

// NOTE: This is a minimal smoke e2e; assumes a seeded user with token TEST_TOKEN and some products with ids 1..3
// In CI, adjust to create a test user and products or mock JWT.

describe('Favorites E2E', () => {
  let app: INestApplication;
  const token = process.env.TEST_JWT || 'dummy';
  const headers = { 'X-App-Version': '1.0', 'X-Platform': 'android', Accept: 'application/json', 'Content-Type': 'application/json' } as any;

  // Simple in-memory FavoritesService mock
  const favState = { ids: [] as number[], version: 0 };
  const makeEtag = () => `W/"fav-${favState.version}"`;
  const favoritesServiceMock: Partial<FavoritesService> = {
    async get(userId: number, includeProducts: boolean) {
      return {
        userId: 'me',
        ids: favState.ids.slice(),
        count: favState.ids.length,
        updatedAt: new Date().toISOString(),
        version: favState.version,
        etag: makeEtag(),
      } as any;
    },
    async patch(userId: number, dto: any) {
      const add = Array.isArray(dto.add) ? dto.add : [];
      const remove = Array.isArray(dto.remove) ? dto.remove : [];
      let current = favState.ids.slice();
      if (remove.length) {
        const rm = new Set(remove);
        current = current.filter((id) => !rm.has(id));
      }
      if (add.length) {
        const seen = new Set(current);
        const toAdd = add.filter((id) => !seen.has(id));
        current = current.concat(toAdd);
      }
      if (current.join(',') !== favState.ids.join(',')) {
        favState.ids = current;
        favState.version += 1;
      }
      return {
        userId: 'me',
        ids: favState.ids.slice(),
        count: favState.ids.length,
        updatedAt: new Date().toISOString(),
        version: favState.version,
        etag: makeEtag(),
      } as any;
    },
    async put(userId: number, dto: any) {
      const ids = Array.isArray(dto.ids) ? dto.ids : [];
      if (ids.join(',') !== favState.ids.join(',')) {
        favState.ids = ids.slice();
        favState.version += 1;
      }
      return {
        userId: 'me',
        ids: favState.ids.slice(),
        count: favState.ids.length,
        updatedAt: new Date().toISOString(),
        version: favState.version,
        etag: makeEtag(),
      } as any;
    },
    async contains(userId: number, ids: number[]) {
      const set = new Set(favState.ids);
      const out: Record<string, boolean> = {};
      for (const id of ids) out[String(id)] = set.has(id);
      return out as any;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(AllowGuard)
      .overrideGuard(RequiredHeadersGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(FavoritesService)
      .useValue(favoritesServiceMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET empty and returns etag', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/favorites')
      .set('Authorization', `Bearer ${token}`)
      .set(headers)
      .expect(200);
    expect(res.body.ids).toBeDefined();
    expect(res.headers['etag']).toBeDefined();
  });

  it('PATCH add is idempotent', async () => {
    const first = await request(app.getHttpServer())
      .patch('/v1/favorites')
      .send({ add: [1, 2, 3] })
      .set('Authorization', `Bearer ${token}`)
      .set(headers)
      .expect(200);
    const second = await request(app.getHttpServer())
      .patch('/v1/favorites')
      .send({ add: [1, 2, 3] })
      .set('Authorization', `Bearer ${token}`)
      .set(headers)
      .expect(200);
    expect(second.body.ids).toEqual(first.body.ids);
  });

  it('PUT replace enforces order and If-Match works', async () => {
    const g = await request(app.getHttpServer())
      .get('/v1/favorites')
      .set('Authorization', `Bearer ${token}`)
      .set(headers)
      .expect(200);
    const etag = g.headers['etag'];
    const res = await request(app.getHttpServer())
      .put('/v1/favorites')
      .send({ ids: [3, 1] })
      .set('If-Match', etag)
      .set('Authorization', `Bearer ${token}`)
      .set(headers)
      .expect(200);
    expect(res.body.ids).toEqual([3, 1]);
  });

  it('contains endpoint returns mapping', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/favorites/contains?ids=1,2,3')
      .set('Authorization', `Bearer ${token}`)
      .set(headers)
      .expect(200);
    expect(res.body.contains).toBeDefined();
    expect(typeof res.body.contains['1']).toBe('boolean');
  });
});
