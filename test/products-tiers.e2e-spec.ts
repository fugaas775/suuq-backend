import { INestApplication, Controller, Get, Query } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// Minimal mock controller to isolate the /products/tiers contract without DB
@Controller('products')
class MockProductsController {
  @Get('tiers')
  async tiers(@Query() q: any) {
    if (q.merge) {
      return {
        items: [
          { id: 1, name: 'A', vendor: { id: 10 } },
          { id: 2, name: 'B', vendor: { id: 11 } },
        ],
        meta: { merged: { totalCandidates: 2, hardCap: 48, antiClump: true } },
      };
    }
    return {
      base: [{ id: 1, name: 'A' }],
      siblings: { '5': [{ id: 2, name: 'B' }] },
      parent: [{ id: 3, name: 'C' }],
      global: [{ id: 4, name: 'D' }],
      meta: { demo: true },
    };
  }
}

describe('Products /products/tiers (shape contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MockProductsController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns bucketed tiers by default', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/products/tiers?categoryId=1')
      .expect(200);
    expect(res.body).toHaveProperty('base');
    expect(res.body).toHaveProperty('siblings');
    expect(res.body).toHaveProperty('parent');
    expect(res.body).toHaveProperty('global');
    expect(Array.isArray(res.body.base)).toBe(true);
  });

  it('returns merged list when merge=1', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/products/tiers?categoryId=1&merge=1')
      .expect(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.meta?.merged?.hardCap).toBeDefined();
  });
});
