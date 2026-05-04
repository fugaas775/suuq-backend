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
import { EmailService } from '../email/email.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockEmailService = {
    sendEmail: jest.fn(),
    sendWelcomeEmail: jest.fn(),
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
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
        {
          provide: getRepositoryToken(SubscriptionRequest),
          useValue: mockRepo,
        },
        { provide: getRepositoryToken(UiSetting), useValue: mockRepo },
        { provide: getRepositoryToken(Wallet), useValue: mockRepo },
        { provide: WalletService, useValue: mockWalletService },
        { provide: CurrencyService, useValue: mockCurrencyService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('restores a deleted user row when the same email signs up again', async () => {
    const deletedUser = {
      id: 42,
      email: 'deleted+42@deleted.local',
      displayName: 'Deleted User',
      roles: [],
      isActive: false,
      deletedAt: new Date('2026-05-01T00:00:00.000Z'),
      deletedBy: 'system|original-email:somopenschool@gmail.com',
    };
    const queryBuilder = {
      withDeleted: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(deletedUser),
    };
    mockRepo.createQueryBuilder.mockReturnValue(queryBuilder);
    mockRepo.save.mockImplementation(async (value) => value);

    const restored = await service.restoreDeletedUserByEmail(
      'somopenschool@gmail.com',
      {
        displayName: 'Som Open School',
        roles: ['CUSTOMER'] as any,
        isActive: true,
      },
    );

    expect(restored).toMatchObject({
      id: 42,
      email: 'somopenschool@gmail.com',
      displayName: 'Som Open School',
      isActive: true,
      deletedAt: null,
      deletedBy: null,
      roles: ['CUSTOMER'],
    });
  });
});
