import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { EtagInterceptor } from '../src/common/interceptors/etag.interceptor';

// e2e tests for /api/products covering per_page cap, search trimming, and ETag/304

describe('Products list (e2e)', () => {
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

  it('caps per_page to 100 and trims search', async () => {
    const overCap = 9999;
    const longSearch = '  phone    case   '.repeat(20); // > 256 before trim
    const res = await request(app.getHttpServer())
      .get(`/api/products?per_page=${overCap}&search=${encodeURIComponent(longSearch)}`)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(typeof res.body.perPage).toBe('number');
    expect(res.body.perPage).toBeLessThanOrEqual(100);
    // server echoes normalized search only via filtering, not in payload; ensure it doesn't error and items array is present
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('supports ETag/304 on /api/products', async () => {
    const res1 = await request(app.getHttpServer())
      .get('/api/products?limit=5&view=grid')
      .expect(200);

    const etag = res1.headers['etag'];
    expect(etag).toBeDefined();

    const res2 = await request(app.getHttpServer())
      .get('/api/products?limit=5&view=grid')
      .set('If-None-Match', etag)
      .expect(304);

    // When 304, body should be empty
    expect(res2.text === '' || res2.body == null).toBe(true);
  });
});
