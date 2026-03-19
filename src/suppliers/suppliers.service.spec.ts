import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../auth/roles.enum';
import { User } from '../users/entities/user.entity';
import { SuppliersService } from './suppliers.service';
import {
  SupplierOnboardingStatus,
  SupplierProfile,
} from './entities/supplier-profile.entity';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let supplierProfilesRepository: { findOne: jest.Mock; save: jest.Mock };
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    supplierProfilesRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value: any) => value),
    };

    auditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        {
          provide: getRepositoryToken(SupplierProfile),
          useValue: supplierProfilesRepository,
        },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(SuppliersService);
  });

  it('allows admins to approve supplier profiles and writes audit metadata', async () => {
    const profile: SupplierProfile = {
      id: 4,
      userId: 8,
      companyName: 'Acme Supply',
      onboardingStatus: SupplierOnboardingStatus.PENDING_REVIEW,
      countriesServed: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SupplierProfile;

    supplierProfilesRepository.findOne.mockResolvedValue(profile);

    const result = await service.updateStatus(
      4,
      { status: SupplierOnboardingStatus.APPROVED },
      {
        id: 1,
        email: 'admin@example.com',
        roles: [UserRole.ADMIN],
        reason: 'KYC complete',
      },
    );

    expect(result.onboardingStatus).toBe(SupplierOnboardingStatus.APPROVED);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'supplier_profile.status.update',
        targetId: 4,
        meta: {
          fromStatus: SupplierOnboardingStatus.PENDING_REVIEW,
          toStatus: SupplierOnboardingStatus.APPROVED,
        },
      }),
    );
  });

  it('rejects supplier self-approval attempts', async () => {
    const profile: SupplierProfile = {
      id: 5,
      userId: 8,
      companyName: 'Acme Supply',
      onboardingStatus: SupplierOnboardingStatus.PENDING_REVIEW,
      countriesServed: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as SupplierProfile;

    supplierProfilesRepository.findOne.mockResolvedValue(profile);

    await expect(
      service.updateStatus(
        5,
        { status: SupplierOnboardingStatus.APPROVED },
        {
          id: 8,
          email: 'supplier@example.com',
          roles: [UserRole.SUPPLIER_ACCOUNT],
        },
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(auditService.log).not.toHaveBeenCalled();
  });
});
