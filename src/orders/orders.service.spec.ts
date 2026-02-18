import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Order, OrderItem } from './entities/order.entity';
import { Dispute } from './entities/dispute.entity';
import { CartService } from '../cart/cart.service';
import { CreditService } from '../credit/credit.service';
import { MpesaService } from '../mpesa/mpesa.service';
import { TelebirrService } from '../telebirr/telebirr.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DoSpacesService } from '../media/do-spaces.service';
import { AuditService } from '../audit/audit.service';
import { CurrencyService } from '../common/services/currency.service';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { Message } from '../chat/entities/message.entity';
import { ProductsService } from '../products/products.service';
import { EbirrService } from '../ebirr/ebirr.service';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: {} },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: getRepositoryToken(Dispute), useValue: {} },
        { provide: CartService, useValue: {} },
        { provide: CreditService, useValue: {} },
        { provide: MpesaService, useValue: {} },
        { provide: TelebirrService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: DoSpacesService, useValue: {} },
        { provide: AuditService, useValue: {} },
        { provide: getRepositoryToken(UiSetting), useValue: {} },
        { provide: getRepositoryToken(Message), useValue: {} },
        { provide: ProductsService, useValue: {} },
        { provide: EbirrService, useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: WalletService, useValue: {} },
        { provide: CurrencyService, useValue: { convert: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
