import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request from 'supertest';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminNotificationsController } from '../src/admin/notifications.admin.controller';
import { NotificationType } from '../src/notifications/entities/notification.entity';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ProductsService } from '../src/products/products.service';

describe('AdminNotificationsController history (e2e)', () => {
  let app: INestApplication;
  let notificationsService: {
    findAll: jest.Mock;
  };

  beforeAll(async () => {
    notificationsService = {
      findAll: jest.fn().mockResolvedValue({
        items: [
          {
            id: 11,
            title: 'Order update',
            type: NotificationType.ORDER,
          },
        ],
        total: 1,
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminNotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        {
          provide: ProductsService,
          useValue: {},
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

  it('lists notification history with validated filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/notifications')
      .query({ page: '2', limit: '50', type: 'ORDER', userId: '7' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        items: [expect.objectContaining({ id: 11, type: 'ORDER' })],
        total: 1,
      }),
    );
    expect(notificationsService.findAll).toHaveBeenCalledWith({
      page: 2,
      limit: 50,
      type: NotificationType.ORDER,
      userId: 7,
    });
  });

  it('rejects malformed notification history filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/notifications?limit=abc')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/notifications?type=NOT_REAL')
      .expect(400);
  });
});
