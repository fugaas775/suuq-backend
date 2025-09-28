import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EtagInterceptor } from '../src/common/interceptors/etag.interceptor';

// This e2e test boots the whole AppModule to validate interceptors and controllers wiring.
// It asserts that /api/v1/products returns expected caching and rate limit headers, contains
// thumbnail/lowRes in the payload, and does not rely on ETag/304 semantics.

describe('V1 Products headers (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Our app typically uses the 'api' global prefix
    app.setGlobalPrefix('api');
    // Disable Express automatic ETag and install our EtagInterceptor like production
    const expressApp = app.getHttpAdapter().getInstance() as
      | (import('express').Express & { set?: (k: string, v: unknown) => void })
      | undefined;
    if (expressApp?.set) {
      expressApp.set('etag', false);
    }
    app.useGlobalInterceptors(new EtagInterceptor(300));
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /api/v1/products should include rate-limit and cache headers and primaryImage variants', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products?limit=3&currency=ETB')
      .expect(200);

    // Rate limit headers
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-policy']).toContain('token-bucket');

    // Cache headers present
    expect(res.headers['cache-control']).toBeDefined();
    expect(res.headers['last-modified']).toBeDefined();

    // No ETag on this hot route by design
    expect(res.headers['etag']).toBeUndefined();

    // Payload contains primaryImage with thumbnail and lowRes when available/derivable
    const body = res.body;
    expect(Array.isArray(body.items)).toBe(true);
    if (body.items.length > 0) {
      const img = body.items[0]?.primaryImage;
      expect(img).toBeDefined();
      expect(typeof img.src === 'string' && img.src.length > 0).toBe(true);
      // Derived variants should be returned when possible; if not derivable, they may be undefined
      // so we only assert they exist when src is in our expected DO Spaces format.
      if (typeof img.src === 'string' && /\/full_/.test(img.src)) {
        expect(typeof img.thumbnail === 'string' && img.thumbnail.length > 0).toBe(true);
        expect(typeof img.lowRes === 'string' && img.lowRes.length > 0).toBe(true);
      }
    }
  });

  it('Conditional GET with If-None-Match should not 304 on /api/v1/products', async () => {
    // First request to learn if server sets any ETag (it should not)
    const res1 = await request(app.getHttpServer())
      .get('/api/v1/products?limit=3&currency=ETB')
      .expect(200);

    const etag = res1.headers['etag'];
    // Even if some middleware sets it, server should not respond 304 for this route
    const res2 = await request(app.getHttpServer())
      .get('/api/v1/products?limit=3&currency=ETB')
      .set('If-None-Match', etag || 'W/"dummy"')
      .expect(200);

    expect(res2.status).toBe(200);
  });
});
