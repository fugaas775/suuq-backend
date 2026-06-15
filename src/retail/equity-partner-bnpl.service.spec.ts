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
import { RetailTenant } from './entities/retail-tenant.entity';
import { TenantModuleEntitlement } from './entities/tenant-module-entitlement.entity';
import { EquityPartnerService } from './equity-partner.service';
import { EbirrService } from '../ebirr/ebirr.service';
import { SupplierProfile } from '../suppliers/entities/supplier-profile.entity';
import { SupplierOnboardingService } from '../suppliers/supplier-onboarding.service';
import { SupplierActivationService } from '../suppliers/supplier-activation.service';

describe('EquityPartnerBnplService', () => {
  let service: EquityPartnerBnplService;

  const partnersRepo = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
    update: jest.fn(async () => ({ affected: 1 })),
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

  const retailTenantsRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 34, ...value })),
  };

  const moduleEntitlementsRepo = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };

  const supplierProfilesRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const supplierOnboardingService = {
    createSupplierAccountForUser: jest.fn(),
  };

  const supplierActivationService = {
    activateForFundedFlow: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    retailTenantsRepo.create.mockImplementation((value) => value);
    retailTenantsRepo.save.mockImplementation(async (value) => ({
      id: 34,
      ...value,
    }));
    moduleEntitlementsRepo.find.mockResolvedValue([]);
    moduleEntitlementsRepo.create.mockImplementation((value) => value);
    moduleEntitlementsRepo.save.mockImplementation(async (value) => value);
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
          provide: getRepositoryToken(RetailTenant),
          useValue: retailTenantsRepo,
        },
        {
          provide: getRepositoryToken(TenantModuleEntitlement),
          useValue: moduleEntitlementsRepo,
        },
        {
          provide: getRepositoryToken(SupplierProfile),
          useValue: supplierProfilesRepo,
        },
        {
          provide: EquityPartnerService,
          useValue: {},
        },
        {
          provide: EbirrService,
          useValue: {},
        },
        {
          provide: SupplierOnboardingService,
          useValue: supplierOnboardingService,
        },
        {
          provide: SupplierActivationService,
          useValue: supplierActivationService,
        },
      ],
    }).compile();

    service = module.get<EquityPartnerBnplService>(EquityPartnerBnplService);
  });

  it('assigns both the target owner and the equity partner when provisioning a BNPL branch for another user', async () => {
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
      period: 'ONE_YEAR',
      city: 'Addis Ababa',
      country: 'Ethiopia',
      address: 'Bole Road',
      phone: '0911223344',
      tinNumber: '1234567890',
    });

    // Provisioning for another user assigns BOTH the target owner and the equity
    // partner (so the partner retains staff access to the branch they funded).
    expect(assignmentsRepo.save).toHaveBeenCalledTimes(2);
    expect(assignmentsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 405,
        userId: 2202,
        role: BranchStaffRole.MANAGER,
        isActive: true,
      }),
    );
    expect(assignmentsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 900,
      }),
    );
  });

  it('BNPL-funds a supplier account: provisions an ACTIVE supplier subscription and records a SUPPLIER activation with the 50/50 split and no branch', async () => {
    partnersRepo.findOne.mockResolvedValue({
      id: 88,
      userId: 900,
      status: EquityPartnerStatus.ACTIVE,
      bnplCreditLimit: 2,
    });
    activationsRepo.count.mockResolvedValue(0);
    usersRepo.findOne.mockResolvedValue({
      id: 2202,
      email: 'wholesaler@example.com',
    });
    // No existing profile for the owner → onboarding creates one (#55).
    supplierProfilesRepo.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.id === 55) {
        return { id: 55, companyName: 'Acme Wholesale' };
      }
      return null;
    });
    supplierOnboardingService.createSupplierAccountForUser.mockResolvedValue({
      supplier: { supplierProfileId: 55, companyName: 'Acme Wholesale' },
    });
    supplierActivationService.activateForFundedFlow.mockResolvedValue({
      id: 9001,
    });
    creditLedgerRepo.findOne.mockResolvedValue(null);

    const activation = await service.startBnplActivation(900, {
      accountKind: 'SUPPLIER',
      supplierCompanyName: 'Acme Wholesale',
      targetOwnerEmail: 'wholesaler@example.com',
      period: 'ONE_YEAR',
      countriesServed: ['ET', 'DJ'],
    });

    // No POS branch is created for a supplier-funded activation.
    expect(branchesRepo.save).not.toHaveBeenCalled();

    // Supplier subscription is provisioned ACTIVE via the funded-flow helper.
    expect(
      supplierActivationService.activateForFundedFlow,
    ).toHaveBeenCalledWith(55, 'ONE_YEAR', {
      fundingMode: 'EQUITY_BNPL',
      equityPartnerId: 88,
    });

    // Activation row: SUPPLIER, no branch, 34,800 gross with a 50/50 split.
    expect(activationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountKind: 'SUPPLIER',
        branchId: null,
        supplierProfileId: 55,
        amountDue: 34_800,
        equityCreditAmount: 17_400,
        settlementAmountDue: 17_400,
      }),
    );
    expect(activation.accountKind).toBe('SUPPLIER');

    // Credit ledger mirrors the supplier discriminator.
    expect(creditLedgerRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountKind: 'SUPPLIER',
        supplierProfileId: 55,
        branchId: null,
      }),
    );
  });

  it('reuses an existing supplier profile instead of creating a second one', async () => {
    partnersRepo.findOne.mockResolvedValue({
      id: 88,
      userId: 900,
      status: EquityPartnerStatus.ACTIVE,
      bnplCreditLimit: 2,
    });
    activationsRepo.count.mockResolvedValue(0);
    usersRepo.findOne.mockResolvedValue({
      id: 2202,
      email: 'wholesaler@example.com',
    });
    supplierProfilesRepo.findOne.mockResolvedValue({
      id: 77,
      companyName: 'Existing Wholesale',
    });
    supplierActivationService.activateForFundedFlow.mockResolvedValue({
      id: 9002,
    });
    creditLedgerRepo.findOne.mockResolvedValue(null);

    await service.startBnplActivation(900, {
      accountKind: 'SUPPLIER',
      supplierCompanyName: 'Ignored When Existing',
      targetOwnerEmail: 'wholesaler@example.com',
      period: 'ONE_YEAR',
    });

    expect(
      supplierOnboardingService.createSupplierAccountForUser,
    ).not.toHaveBeenCalled();
    expect(
      supplierActivationService.activateForFundedFlow,
    ).toHaveBeenCalledWith(77, 'ONE_YEAR', expect.any(Object));
  });
});
