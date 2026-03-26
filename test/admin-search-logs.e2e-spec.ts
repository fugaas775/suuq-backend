import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { RolesGuard } from '../src/auth/roles.guard';
import { SearchLog } from '../src/search/entities/search-log.entity';
import { AdminSearchLogController } from '../src/admin/search-log.admin.controller';

describe('AdminSearchLogController (e2e)', () => {
  let app: INestApplication;
  let queryBuilder: {
    orderBy: jest.Mock;
    take: jest.Mock;
    andWhere: jest.Mock;
    getMany: jest.Mock;
  };

  beforeAll(async () => {
    queryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          query: 'coffee beans',
          source: 'mobile',
          resultCount: 4,
        },
      ]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminSearchLogController],
      providers: [
        {
          provide: getRepositoryToken(SearchLog),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists search logs with validated filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/search-logs')
      .query({ q: '  coffee beans  ', source: '  mobile  ', limit: '75' })
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: 1,
        query: 'coffee beans',
        source: 'mobile',
      }),
    ]);
    expect(queryBuilder.take).toHaveBeenCalledWith(75);
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      'log.query ILIKE :q',
      { q: '%coffee beans%' },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      'log.source = :source',
      { source: 'mobile' },
    );
  });

  it('rejects malformed search-log limit filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/search-logs?limit=abc')
      .expect(400);
  });
});
