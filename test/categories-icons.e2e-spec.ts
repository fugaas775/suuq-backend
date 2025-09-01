import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from '../src/categories/entities/category.entity';
import { Repository } from 'typeorm';
import { DataSource } from 'typeorm';

/** Minimal e2e to assert iconName/iconUrl are exposed in list responses */

describe('Categories icons (e2e)', () => {
  let app: INestApplication;
  let repo: Repository<Category>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
    await app.init();

    repo = moduleFixture.get<Repository<Category>>(getRepositoryToken(Category));
  dataSource = app.get(DataSource);

  // Insert a category with icons directly via repository for test speed
  const unique = Date.now();
  const cat = repo.create({ name: `Icon Test ${unique}` , slug: `icon-test-${unique}`, iconName: 'test_icon', iconUrl: 'https://cdn.example/icons/test_icon.svg' });
    await repo.save(cat);
  });

  afterAll(async () => {
    await app.close();
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('/api/categories (GET) exposes iconName/iconUrl', async () => {
    type CategoryLite = { slug?: string; iconName?: string; iconUrl?: string };
    const res = await request(app.getHttpServer()).get('/api/categories').expect(200);
    const list = res.body as CategoryLite[];
    const anyWithIcons = list.find((c) => c.slug?.startsWith('icon-test-') && !!c.iconName && !!c.iconUrl);
    expect(anyWithIcons).toBeTruthy();
  });
});
