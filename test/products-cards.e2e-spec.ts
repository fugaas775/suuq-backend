import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EtagInterceptor } from '../src/common/interceptors/etag.interceptor';

// e2e tests for /api/products/cards covering lean payload and ETag

describe('Products cards (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    const expressApp = app.getHttpAdapter().getInstance() as any;
    if (expressApp?.set) expressApp.set('etag', false);
    app.useGlobalInterceptors(new EtagInterceptor(60));
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns ProductCard shape and honors ETag/304', async () => {
    const res1 = await request(app.getHttpServer())
      .get('/api/products/cards?limit=4')
      .expect(200);
    expect(Array.isArray(res1.body.items)).toBe(true);
    if (res1.body.items.length > 0) {
      const p = res1.body.items[0];
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('price');
      expect(p).toHaveProperty('currency');
      expect(p).toHaveProperty('createdAt');
      // Lean: no heavy relations like images array; but may expose primaryImage
    }
    const etag = res1.headers['etag'];
    expect(etag).toBeDefined();

    const res2 = await request(app.getHttpServer())
      .get('/api/products/cards?limit=4')
      .set('If-None-Match', etag)
      .expect(304);
    expect(res2.text === '' || res2.body == null).toBe(true);
  });
});
