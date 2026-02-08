import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { PayoutLog, PayoutStatus } from './entities/payout-log.entity';
import { TopUpRequest } from './entities/top-up-request.entity';
import { User } from '../users/entities/user.entity';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { CurrencyService } from '../common/services/currency.service';
import { UsersService } from '../users/users.service';
import { DataSource } from 'typeorm';

describe('WalletService', () => {
  let service: WalletService;
  let payoutRepo: any;

  beforeEach(async () => {
    payoutRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getRepositoryToken(Wallet), useValue: {} },
        { provide: getRepositoryToken(WalletTransaction), useValue: {} },
        { provide: getRepositoryToken(PayoutLog), useValue: payoutRepo },
        { provide: getRepositoryToken(TopUpRequest), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(UiSetting), useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: CurrencyService, useValue: {} },
        { provide: UsersService, useValue: {} },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('exportPendingPayouts', () => {
    it('should generate CSV correctly', async () => {
      const mockDate = new Date('2023-01-01T10:00:00Z');
      const mockPayouts = [
        {
          id: 1,
          vendor: {
            id: 101,
            displayName: 'Test Vendor',
            phoneNumber: '+251911223344',
          },
          amount: 500.0,
          currency: 'ETB',
          transactionReference: 'REF-001',
          createdAt: mockDate,
        },
      ];

      payoutRepo.find.mockResolvedValue(mockPayouts);

      const csv = await service.exportPendingPayouts();

      expect(payoutRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PENDING' } }),
      );
      expect(csv).toContain('Test Vendor');
      expect(csv).toContain('REF-001');
      expect(csv).toContain('500');
    });
  });

  describe('updatePayoutStatus', () => {
    it('should update status and reference', async () => {
      const mockPayout = {
        id: 1,
        status: PayoutStatus.PENDING,
        transactionReference: 'OLD-REF',
      };
      payoutRepo.findOne.mockResolvedValue(mockPayout);
      payoutRepo.save.mockImplementation((p) => Promise.resolve(p));

      const res = await service.updatePayoutStatus(
        1,
        PayoutStatus.SUCCESS,
        'NEW-BANK-REF',
      );

      expect(res.status).toBe(PayoutStatus.SUCCESS);
      expect(res.transactionReference).toBe('NEW-BANK-REF');
      expect(payoutRepo.save).toHaveBeenCalled();
    });
  });
});
