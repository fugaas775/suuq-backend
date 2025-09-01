import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { CartService } from '../cart/cart.service';
import { MpesaService } from '../mpesa/mpesa.service';
import { TelebirrService } from '../telebirr/telebirr.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: {} },
        { provide: CartService, useValue: {} },
        { provide: MpesaService, useValue: {} },
        { provide: TelebirrService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
