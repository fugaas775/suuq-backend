import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { SubscriptionAnalyticsService } from '../metrics/subscription-analytics.service';
import { UsersService } from '../users/users.service';
import { AdminUsersController } from './users.admin.controller';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let usersService: {
    findActiveProUsers: jest.Mock;
    findAllSubscriptionRequests: jest.Mock;
    extendSubscription: jest.Mock;
    findAll: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findActiveProUsers: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, pages: 0 }),
      findAllSubscriptionRequests: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, pages: 0 }),
      extendSubscription: jest.fn(),
      findAll: jest.fn().mockResolvedValue({
        users: [
          {
            id: 7,
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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        {
          provide: SubscriptionAnalyticsService,
          useValue: { getAnalytics: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(AdminUsersController);
  });

  it('forwards validated active subscription pagination', async () => {
    await controller.getActiveSubscriptions({ page: 2, limit: 25 });

    expect(usersService.findActiveProUsers).toHaveBeenCalledWith(2, 25);
  });

  it('forwards validated subscription request filters', async () => {
    await controller.listSubscriptionRequests({
      page: 3,
      limit: 15,
      status: 'APPROVED' as any,
    });

    expect(usersService.findAllSubscriptionRequests).toHaveBeenCalledWith(
      3,
      15,
      'APPROVED',
    );
  });

  it('returns user list metadata only when validated meta=1 is supplied', async () => {
    const result = await controller.list(
      plainToInstance(Object, {
        page: 2,
        limit: 50,
        meta: '1',
        q: 'vendor',
      }) as any,
    );

    expect(usersService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 50,
        pageSize: 50,
        q: 'vendor',
        meta: '1',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        data: [expect.objectContaining({ id: 7 })],
        meta: { total: 1, page: 2, pageSize: 50 },
      }),
    );
  });
});
