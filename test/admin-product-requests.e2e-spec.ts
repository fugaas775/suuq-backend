import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminProductRequestsController } from '../src/admin/product-requests.admin.controller';
import { ProductRequest } from '../src/product-requests/entities/product-request.entity';
import { ProductRequestForward } from '../src/product-requests/entities/product-request-forward.entity';
import { User } from '../src/users/entities/user.entity';
import { NotificationsService } from '../src/notifications/notifications.service';
import { EmailService } from '../src/email/email.service';

describe('AdminProductRequestsController query contract (e2e)', () => {
  let app: INestApplication;
  let requestQueryBuilder: {
    leftJoinAndSelect: jest.Mock;
    orderBy: jest.Mock;
    take: jest.Mock;
    where: jest.Mock;
    loadRelationCountAndMap: jest.Mock;
    getMany: jest.Mock;
  };

  beforeAll(async () => {
    requestQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      loadRelationCountAndMap: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 11,
          title: 'Bulk cooking oil',
          buyerId: 17,
          buyer: { displayName: 'Bole Kitchen' },
          category: { name: 'Groceries' },
        },
      ]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminProductRequestsController],
      providers: [
        {
          provide: getRepositoryToken(ProductRequest),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(requestQueryBuilder),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ProductRequestForward),
          useValue: { find: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { find: jest.fn() },
        },
        { provide: NotificationsService, useValue: { sendToUser: jest.fn() } },
        {
          provide: EmailService,
          useValue: { sendProductRequestForwardedToVendor: jest.fn() },
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

  it('lists product requests with validated status and limit filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/product-requests')
      .query({ status: 'OPEN,IN_PROGRESS', limit: '25' })
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: 11,
        categoryName: 'Groceries',
        buyerName: 'Bole Kitchen',
      }),
    ]);
    expect(requestQueryBuilder.take).toHaveBeenCalledWith(25);
    expect(requestQueryBuilder.where).toHaveBeenCalledWith(
      'request.status IN (:...statuses)',
      { statuses: ['OPEN', 'IN_PROGRESS'] },
    );
  });

  it('rejects malformed product-request filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/product-requests?status=NOT_REAL')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/product-requests?limit=abc')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/product-requests?limit=0')
      .expect(400);
  });
});
