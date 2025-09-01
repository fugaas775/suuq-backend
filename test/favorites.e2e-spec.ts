import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import * as request from 'supertest';

// NOTE: This is a minimal smoke e2e; assumes a seeded user with token TEST_TOKEN and some products with ids 1..3
// In CI, adjust to create a test user and products or mock JWT.

describe('Favorites E2E', () => {
  let app: INestApplication;
  const token = process.env.TEST_JWT || '';
  const headers = { 'X-App-Version': '1.0', 'X-Platform': 'android' } as any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
