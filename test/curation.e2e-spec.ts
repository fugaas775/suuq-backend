import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Curation (e2e)', () => {
  let app: INestApplication<App>;

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

  it('/api/curation/home (GET) shape', async () => {
    const res = await request(app.getHttpServer()).get('/api/curation/home').expect(200);
    const body = res.body;
    expect(body).toHaveProperty('newArrivals');
    expect(body).toHaveProperty('bestSellers');
    expect(body.newArrivals).toHaveProperty('key', 'home-new');
    expect(body.bestSellers).toHaveProperty('key', 'home-best');
    expect(body).toHaveProperty('meta');
    expect(typeof body.meta.generatedAt).toBe('string');
  });

  it('/api/curation/section/home-new (GET) works', async () => {
    const res = await request(app.getHttpServer()).get('/api/curation/section/home-new?limit=5').expect(200);
    expect(res.body).toHaveProperty('items');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('perPage');
    expect(res.body).toHaveProperty('total');
  });

  it('/api/curation/section/invalid (GET) 400', async () => {
    await request(app.getHttpServer()).get('/api/curation/section/invalid').expect(400);
  });
});
