import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Categories tree ETag (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/categories/tree returns ETag then 304 with If-None-Match', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/categories/tree')
      .expect(200);

    const etag = first.headers['etag'];
    expect(etag).toBeTruthy();
    expect(first.headers['cache-control']).toContain('public');

    await request(app.getHttpServer())
      .get('/api/categories/tree')
      .set('If-None-Match', etag)
      .expect(304);
  });
});
