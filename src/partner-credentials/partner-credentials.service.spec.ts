import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit/audit.service';
import { Branch } from '../branches/entities/branch.entity';
import { PartnerCredentialsService } from './partner-credentials.service';
import {
  PartnerCredentialSortField,
  SortDirection,
} from './dto/partner-credential-list-query.dto';
import {
  PartnerCredential,
  PartnerCredentialStatus,
  PartnerType,
} from './entities/partner-credential.entity';
import {
  DEFAULT_POS_PARTNER_SCOPES,
  PosPartnerScope,
  PosPartnerScopePreset,
} from './partner-credential-scopes';

describe('PartnerCredentialsService', () => {
  let service: PartnerCredentialsService;
  let partnerCredentialsRepository: {
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let branchesRepository: { findOne: jest.Mock };
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    partnerCredentialsRepository = {
      create: jest.fn((value: any) => value),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn(async (value: any) => value),
    };

    branchesRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 3 }),
    };

    auditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerCredentialsService,
        {
          provide: getRepositoryToken(PartnerCredential),
          useValue: partnerCredentialsRepository,
        },
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(PartnerCredentialsService);
  });

  it('revokes active partner credentials and records audit metadata', async () => {
    const credential: PartnerCredential = {
      id: 7,
      name: 'POS Link',
      partnerType: PartnerType.POS,
      scopes: [PosPartnerScope.POS_SYNC_WRITE],
      keyHash: 'hashed-key',
      status: PartnerCredentialStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PartnerCredential;

    partnerCredentialsRepository.findOne.mockResolvedValue(credential);

    const result = await service.revoke(7, {
      id: 2,
      email: 'admin@example.com',
      reason: 'Compromised key rotation',
    });

    expect(result.status).toBe(PartnerCredentialStatus.REVOKED);
    expect(result.revokedAt).toBeInstanceOf(Date);
    expect(result.revokedByUserId).toBe(2);
    expect(result.revocationReason).toBe('Compromised key rotation');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'partner_credential.revoke',
        targetId: 7,
      }),
    );
  });

  it('rejects revocation for missing credentials', async () => {
    partnerCredentialsRepository.findOne.mockResolvedValue(null);

    await expect(service.revoke(99, { id: 1 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('authenticates active POS credentials with matching explicit scopes and updates lastUsedAt', async () => {
    const credential: PartnerCredential = {
      id: 8,
      name: 'POS Link',
      partnerType: PartnerType.POS,
      branchId: 3,
      scopes: [PosPartnerScope.POS_SYNC_WRITE],
      keyHash:
        '2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b',
      status: PartnerCredentialStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PartnerCredential;

    partnerCredentialsRepository.find.mockResolvedValue([credential]);

    const result = await service.authenticatePosCredential('secret', [
      PosPartnerScope.POS_SYNC_WRITE,
    ]);

    expect(result.id).toBe(8);
    expect(result.lastUsedAt).toBeInstanceOf(Date);
    expect(partnerCredentialsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 8 }),
    );
  });

  it('lists partner credentials with pagination and filters for admin responses', async () => {
    const credentials = [
      {
        id: 8,
        name: 'POS Link',
        partnerType: PartnerType.POS,
        branchId: 3,
        branch: { id: 3, name: 'Main Branch' },
      },
    ] as PartnerCredential[];

    const queryBuilder = partnerCredentialsRepository.createQueryBuilder();
    queryBuilder.getManyAndCount.mockResolvedValue([credentials, 1]);

    const result = await service.findAll({
      page: 2,
      limit: 10,
      partnerType: PartnerType.POS,
      status: PartnerCredentialStatus.ACTIVE,
      branchId: 3,
      search: 'main',
      sortBy: PartnerCredentialSortField.NAME,
      sortDirection: SortDirection.ASC,
      secondarySortBy: PartnerCredentialSortField.STATUS,
      secondarySortDirection: SortDirection.DESC,
    });

    expect(
      partnerCredentialsRepository.createQueryBuilder,
    ).toHaveBeenCalledWith('credential');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'credential.partnerType = :partnerType',
      { partnerType: PartnerType.POS },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'credential.status = :status',
      { status: PartnerCredentialStatus.ACTIVE },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'credential.branchId = :branchId',
      { branchId: 3 },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      "(LOWER(credential.name) LIKE :search OR LOWER(COALESCE(branch.name, '')) LIKE :search)",
      { search: '%main%' },
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'credential.name',
      SortDirection.ASC,
      'NULLS LAST',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(
      1,
      'credential.status',
      SortDirection.DESC,
      'NULLS LAST',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(
      2,
      'credential.createdAt',
      'DESC',
    );
    expect(result).toEqual({
      items: credentials,
      total: 1,
      page: 2,
      perPage: 10,
      totalPages: 1,
    });
  });

  it('requires POS partner credentials to be created with a valid branch binding', async () => {
    const created = await service.create({
      name: 'Branch POS',
      partnerType: PartnerType.POS,
      branchId: 3,
      scopes: [PosPartnerScope.POS_SYNC_WRITE],
      keyHash: 'secret',
    });

    expect(branchesRepository.findOne).toHaveBeenCalledWith({
      where: { id: 3 },
    });
    expect(created.branchId).toBe(3);
    expect(created.keyHash).toHaveLength(64);
  });

  it('defaults new POS credentials to the explicit partner scope bundle', async () => {
    const created = await service.create({
      name: 'Branch POS',
      partnerType: PartnerType.POS,
      branchId: 3,
      keyHash: 'secret',
    });

    expect(created.scopes).toEqual(DEFAULT_POS_PARTNER_SCOPES);
  });

  it('applies a cashier terminal preset when creating POS credentials', async () => {
    const created = await service.create({
      name: 'Cashier POS',
      partnerType: PartnerType.POS,
      branchId: 3,
      scopePreset: PosPartnerScopePreset.CASHIER_TERMINAL,
      keyHash: 'secret',
    });

    expect(created.scopes).toEqual([
      PosPartnerScope.POS_CHECKOUT_READ,
      PosPartnerScope.POS_CHECKOUT_WRITE,
      PosPartnerScope.POS_REGISTER_READ,
      PosPartnerScope.POS_REGISTER_WRITE,
    ]);
  });

  it('rejects scope presets for non-POS partner credentials', async () => {
    await expect(
      service.create({
        name: 'Supplier Link',
        partnerType: PartnerType.SUPPLIER,
        scopePreset: PosPartnerScopePreset.FULL_TERMINAL,
        keyHash: 'secret',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not duplicate createdAt ordering when createdAt is already the selected primary sort', async () => {
    const queryBuilder = partnerCredentialsRepository.createQueryBuilder();

    await service.findAll({
      sortBy: PartnerCredentialSortField.CREATED_AT,
      sortDirection: SortDirection.DESC,
      secondarySortBy: PartnerCredentialSortField.STATUS,
      secondarySortDirection: SortDirection.ASC,
    });

    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'credential.createdAt',
      SortDirection.DESC,
      'NULLS LAST',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenCalledTimes(1);
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
      'credential.status',
      SortDirection.ASC,
      'NULLS LAST',
    );
  });

  it('rejects branch access when a POS credential is used for another branch', () => {
    expect(() =>
      service.assertCredentialBranchAccess(
        {
          id: 8,
          partnerType: PartnerType.POS,
          branchId: 3,
        } as PartnerCredential,
        4,
      ),
    ).toThrow('Partner credential is not authorized for branch 4');
  });

  it('rotates the branch assignment for a POS partner credential and writes audit metadata', async () => {
    const credential: PartnerCredential = {
      id: 9,
      name: 'POS Link',
      partnerType: PartnerType.POS,
      branchId: 3,
      scopes: [PosPartnerScope.POS_SYNC_WRITE],
      keyHash: 'hashed-key',
      status: PartnerCredentialStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PartnerCredential;

    partnerCredentialsRepository.findOne.mockResolvedValue(credential);
    branchesRepository.findOne.mockResolvedValue({ id: 4 });

    const result = await service.rotateBranchAssignment(9, 4, {
      id: 2,
      email: 'admin@example.com',
      reason: 'Move terminal to kiosk branch',
    });

    expect(result.branchId).toBe(4);
    expect(partnerCredentialsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9, branchId: 4 }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'partner_credential.branch.rotate',
        targetId: 9,
        meta: expect.objectContaining({
          previousBranchId: 3,
          nextBranchId: 4,
        }),
      }),
    );
  });

  it('accepts legacy sync scopes for existing POS credentials during authentication', async () => {
    const credential: PartnerCredential = {
      id: 10,
      name: 'Legacy POS Link',
      partnerType: PartnerType.POS,
      branchId: 3,
      scopes: ['sync:write'],
      keyHash:
        '2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b',
      status: PartnerCredentialStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PartnerCredential;

    partnerCredentialsRepository.find.mockResolvedValue([credential]);

    const result = await service.authenticatePosCredential('secret', [
      PosPartnerScope.POS_SYNC_WRITE,
    ]);

    expect(result.id).toBe(10);
  });

  it('rejects unsupported explicit scopes when creating POS credentials', async () => {
    await expect(
      service.create({
        name: 'Branch POS',
        partnerType: PartnerType.POS,
        branchId: 3,
        scopes: ['orders:write'],
        keyHash: 'secret',
      }),
    ).rejects.toThrow('Unsupported POS partner scope: orders:write');
  });

  it('canonicalizes legacy sync aliases into explicit POS scopes when creating POS credentials', async () => {
    const created = await service.create({
      name: 'Branch POS',
      partnerType: PartnerType.POS,
      branchId: 3,
      scopePreset: PosPartnerScopePreset.SYNC_ONLY,
      scopes: ['sync:write', 'pos:ingest', PosPartnerScope.POS_CHECKOUT_READ],
      keyHash: 'secret',
    });

    expect(created.scopes).toEqual([
      PosPartnerScope.POS_SYNC_WRITE,
      PosPartnerScope.POS_CHECKOUT_READ,
    ]);
  });
});
