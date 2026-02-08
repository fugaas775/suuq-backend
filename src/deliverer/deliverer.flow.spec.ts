import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DelivererService } from './deliverer.service';
import {
  Order,
  OrderStatus,
  DeliveryAcceptanceStatus,
} from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { WalletService } from '../wallet/wallet.service';
import { SettingsService } from '../settings/settings.service';
import { EmailService } from '../email/email.service';
import { CurrencyService } from '../common/services/currency.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('DelivererService - Reject Assignment Flow', () => {
  let service: DelivererService;
  let orderRepository: Repository<Order>;

  const mockDeliverer = { id: 101, roles: ['DELIVERER'] } as User;

  const mockOrder = {
    id: 1,
    status: OrderStatus.SHIPPED,
    deliveryAcceptanceStatus: DeliveryAcceptanceStatus.PENDING,
    deliverer: mockDeliverer,
  } as Order;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DelivererService,
        {
          provide: getRepositoryToken(Order),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({ affected: 1 }),
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([]),
              getOne: jest.fn().mockResolvedValue(null),
            })),
          },
        },
        { provide: getRepositoryToken(Product), useClass: Repository },
        { provide: WalletService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: CurrencyService, useValue: {} },
        {
          provide: NotificationsService,
          useValue: { createAndDispatch: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<DelivererService>(DelivererService);
    orderRepository = module.get<Repository<Order>>(getRepositoryToken(Order));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('rejectAssignment', () => {
    it('should reject assignment and reset order status', async () => {
      // Setup mock to return the order with deliverer assigned
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(mockOrder);

      // Execute
      const result = await service.rejectAssignment(101, 1);

      // Verify success
      expect(result).toEqual({ success: true });

      // Verify QueryBuilder was called correctly to update DB
      // We expect createQueryBuilder to act on Order repo
      // And set status back to PROCESSING and deliverer to null
      expect(orderRepository.createQueryBuilder).toHaveBeenCalled(); // eslint-disable-line @typescript-eslint/unbound-method
    });

    it('should throw ForbiddenException if deliverer does not match', async () => {
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(mockOrder);

      const promise = service.rejectAssignment(999, 1);

      await expect(promise).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if order not found', async () => {
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue(null);

      await expect(service.rejectAssignment(101, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
