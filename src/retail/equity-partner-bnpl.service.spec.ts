import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EquityPartnerBnplService } from './equity-partner-bnpl.service';
import {
  EquityPartner,
  EquityPartnerStatus,
} from './entities/equity-partner.entity';
import { EquityPartnerBnplActivation } from './entities/equity-partner-bnpl-activation.entity';
import { EquityPartnerBnplCreditLedgerEntry } from './entities/equity-partner-bnpl-credit-ledger.entity';
import { Branch } from '../branches/entities/branch.entity';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from '../branch-staff/entities/branch-staff-assignment.entity';
import { User } from '../users/entities/user.entity';
import { TenantSubscription } from './entities/tenant-subscription.entity';
import { EquityPartnerService } from './equity-partner.service';
import { EbirrService } from '../ebirr/ebirr.service';

describe('EquityPartnerBnplService', () => {
  let service: EquityPartnerBnplService;

  const partnersRepo = {
    findOne: jest.fn(),
  };

  const activationsRepo = {
    count: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 701, ...value })),
  };

  const creditLedgerRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };

  const branchesRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({
      id: 405,
      createdAt: new Date(),
      ...value,
    })),
    find: jest.fn(),
  };

  const assignmentsRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };

  const usersRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 2202, ...value })),
  };

  const subscriptionsRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    activationsRepo.create.mockImplementation((value) => value);
    activationsRepo.save.mockImplementation(async (value) => ({
      id: 701,
      ...value,
    }));
    creditLedgerRepo.create.mockImplementation((value) => value);
    creditLedgerRepo.save.mockImplementation(async (value) => value);
    branchesRepo.create.mockImplementation((value) => value);
    branchesRepo.save.mockImplementation(async (value) => ({
      id: 405,
      createdAt: new Date('2026-05-02T00:00:00.000Z'),
      ...value,
    }));
    assignmentsRepo.create.mockImplementation((value) => value);
    assignmentsRepo.save.mockImplementation(async (value) => value);
    usersRepo.create.mockImplementation((value) => value);
    usersRepo.save.mockImplementation(async (value) => ({
      id: 2202,
      ...value,
    }));
    subscriptionsRepo.create.mockImplementation((value) => value);
    subscriptionsRepo.save.mockImplementation(async (value) => value);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EquityPartnerBnplService,
        {
          provide: getRepositoryToken(EquityPartner),
          useValue: partnersRepo,
        },
        {
          provide: getRepositoryToken(EquityPartnerBnplActivation),
          useValue: activationsRepo,
        },
        {
          provide: getRepositoryToken(EquityPartnerBnplCreditLedgerEntry),
          useValue: creditLedgerRepo,
        },
        {
          provide: getRepositoryToken(Branch),
          useValue: branchesRepo,
        },
        {
          provide: getRepositoryToken(BranchStaffAssignment),
          useValue: assignmentsRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: usersRepo,
        },
        {
          provide: getRepositoryToken(TenantSubscription),
          useValue: subscriptionsRepo,
        },
        {
          provide: EquityPartnerService,
          useValue: {},
        },
        {
          provide: EbirrService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<EquityPartnerBnplService>(EquityPartnerBnplService);
  });

  it('assigns only the target owner when provisioning a BNPL branch for another user', async () => {
    partnersRepo.findOne.mockResolvedValue({
      id: 88,
      userId: 900,
      status: EquityPartnerStatus.ACTIVE,
      bnplCreditLimit: 2,
    });
    activationsRepo.count.mockResolvedValue(0);
    usersRepo.findOne.mockResolvedValue({
      id: 2202,
      email: 'owner@example.com',
    });
    branchesRepo.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.ownerId === 900) {
        return {
          id: 12,
          retailTenantId: 34,
        };
      }
      if (where?.code) {
        return null;
      }
      return null;
    });
    creditLedgerRepo.findOne.mockResolvedValue(null);

    await service.startBnplActivation(900, {
      branchName: 'Bole Salon',
      serviceFormat: 'RETAIL',
      targetOwnerEmail: 'owner@example.com',
      period: 'SIX_MONTHS',
      city: 'Addis Ababa',
      country: 'Ethiopia',
      address: 'Bole Road',
      phone: '0911223344',
      tinNumber: '1234567890',
    });

    expect(assignmentsRepo.save).toHaveBeenCalledTimes(1);
    expect(assignmentsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 405,
        userId: 2202,
        role: BranchStaffRole.MANAGER,
        isActive: true,
      }),
    );
    expect(assignmentsRepo.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 900,
      }),
    );
  });
});
