import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { SubscriptionRequest } from './entities/subscription-request.entity';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { WalletService } from '../wallet/wallet.service';
import { CurrencyService } from '../common/services/currency.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('UsersService', () => {
  let service: UsersService;
  
  const mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
  };

  const mockWalletService = {
      createWallet: jest.fn(),
  };

  const mockCurrencyService = {
      convert: jest.fn(),
  };

  const mockNotificationsService = {
      sendToUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: getRepositoryToken(SubscriptionRequest), useValue: mockRepo },
        { provide: getRepositoryToken(UiSetting), useValue: mockRepo },
        { provide: getRepositoryToken(Wallet), useValue: mockRepo },
        { provide: WalletService, useValue: mockWalletService },
        { provide: CurrencyService, useValue: mockCurrencyService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
