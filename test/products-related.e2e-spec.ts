import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EtagInterceptor } from '../src/common/interceptors/etag.interceptor';

// e2e tests for /api/products/:id/related

describe('Products related (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    const expressApp = app.getHttpAdapter().getInstance();
    if (expressApp?.set) expressApp.set('etag', false);
    app.useGlobalInterceptors(new EtagInterceptor(60));
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 with items and excludes base product', async () => {
    // Pick an existing product id by calling the list endpoint
    const list = await request(app.getHttpServer())
      .get('/api/products?limit=1&view=grid')
      .expect(200);
    const baseId = Array.isArray(list.body.items) && list.body.items[0]?.id;
    expect(typeof baseId).toBe('number');

    const rel = await request(app.getHttpServer())
      .get(`/api/products/${baseId}/related?limit=8`)
      .expect(200);

    expect(Array.isArray(rel.body.items)).toBe(true);
    // Should not include the base product itself
    const containsBase = (rel.body.items || []).some(
      (p: any) => p?.id === baseId,
    );
    expect(containsBase).toBe(false);
  });

  it('honors city filter and supports ETag/304', async () => {
    // Try to choose a city from an actual product
    const list = await request(app.getHttpServer())
      .get('/api/products?limit=1&view=grid')
      .expect(200);
    const base = list.body.items[0];
    const baseId = base?.id;
    const city = (base?.listingCity || base?.listing_city || '').toString();

    const url = city
      ? `/api/products/${baseId}/related?limit=6&city=${encodeURIComponent(city)}`
      : `/api/products/${baseId}/related?limit=6`;

    const res1 = await request(app.getHttpServer()).get(url).expect(200);
    expect(Array.isArray(res1.body.items)).toBe(true);
    if (city) {
      // All items should match the city when filter applied
      const allMatch = (res1.body.items || []).every(
        (p: any) =>
          String(p.listingCity || p.listing_city || '').toLowerCase() ===
          city.toLowerCase(),
      );
      // It's possible dataset has sparse cities; only assert when there are items
      if ((res1.body.items || []).length > 0) expect(allMatch).toBe(true);
    }

    const etag = res1.headers['etag'];
    expect(etag).toBeDefined();

    const res2 = await request(app.getHttpServer())
      .get(url)
      .set('If-None-Match', etag)
      .expect(304);
    expect(res2.text === '' || res2.body == null).toBe(true);
  });
});
