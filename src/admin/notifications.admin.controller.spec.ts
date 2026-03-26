import { Test, TestingModule } from '@nestjs/testing';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductsService } from '../products/products.service';
import { AdminNotificationsController } from './notifications.admin.controller';

describe('AdminNotificationsController', () => {
  let controller: AdminNotificationsController;
  let notificationsService: {
    findAll: jest.Mock;
  };

  beforeEach(async () => {
    notificationsService = {
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
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
    }).compile();

    controller = module.get(AdminNotificationsController);
  });

  it('forwards validated notification history filters', async () => {
    await controller.getHistory({
      page: 2,
      limit: 50,
      type: NotificationType.ORDER,
      userId: 7,
    });

    expect(notificationsService.findAll).toHaveBeenCalledWith({
      page: 2,
      limit: 50,
      type: NotificationType.ORDER,
      userId: 7,
    });
  });

  it('defaults notification history pagination when omitted', async () => {
    await controller.getHistory({});

    expect(notificationsService.findAll).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      type: undefined,
      userId: undefined,
    });
  });
});
