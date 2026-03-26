import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request from 'supertest';
import { SubscriptionAnalyticsService } from '../src/metrics/subscription-analytics.service';
import { RolesGuard } from '../src/auth/roles.guard';
import { UsersService } from '../src/users/users.service';
import { AdminUsersController } from '../src/admin/users.admin.controller';

describe('AdminUsersController query contract (e2e)', () => {
  let app: INestApplication;
  let usersService: {
    findActiveProUsers: jest.Mock;
    findAllSubscriptionRequests: jest.Mock;
    extendSubscription: jest.Mock;
    findAll: jest.Mock;
  };

  beforeAll(async () => {
    usersService = {
      findActiveProUsers: jest.fn().mockResolvedValue({
        data: [{ id: 11, email: 'pro@suuq.test' }],
        total: 1,
        page: 2,
        pages: 1,
      }),
      findAllSubscriptionRequests: jest.fn().mockResolvedValue({
        data: [{ id: 21, status: 'APPROVED' }],
        total: 1,
        page: 3,
        pages: 1,
      }),
      extendSubscription: jest.fn(),
      findAll: jest.fn().mockResolvedValue({
        users: [
          {
            id: 31,
            email: 'vendor@suuq.test',
            displayName: 'Vendor',
            phoneNumber: '+251911000111',
            roles: ['VENDOR'],
          },
        ],
        total: 1,
        page: 2,
        pageSize: 50,
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        {
          provide: SubscriptionAnalyticsService,
          useValue: { getAnalytics: jest.fn() },
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
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists active subscriptions and subscription requests with validated filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/users/subscription/active')
      .query({ page: '2', limit: '25' })
      .expect(200);

    expect(usersService.findActiveProUsers).toHaveBeenCalledWith(2, 25);

    const requests = await request(app.getHttpServer())
      .get('/api/admin/users/subscription/requests')
      .query({ page: '3', limit: '15', status: 'approved' })
      .expect(200);

    expect(requests.body).toEqual(
      expect.objectContaining({ page: 3, total: 1 }),
    );
    expect(usersService.findAllSubscriptionRequests).toHaveBeenCalledWith(
      3,
      15,
      'APPROVED',
    );
  });

  it('returns list metadata only for validated meta=1', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/users')
      .query({ page: '2', limit: '50', q: 'vendor', meta: '1' })
      .expect(200);

    expect(usersService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 50,
        pageSize: 50,
        q: 'vendor',
        meta: '1',
      }),
    );
    expect(response.body).toEqual(
      expect.objectContaining({
        data: [expect.objectContaining({ id: 31 })],
        meta: { total: 1, page: 2, pageSize: 50 },
      }),
    );
  });

  it('rejects malformed admin user query filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/users/subscription/active?page=abc')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/users/subscription/requests?status=soon')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/users?meta=yes')
      .expect(400);
  });
});
