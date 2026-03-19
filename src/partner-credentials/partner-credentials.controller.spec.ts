import { Test, TestingModule } from '@nestjs/testing';
import { PartnerCredentialsController } from './partner-credentials.controller';
import { PartnerCredentialsService } from './partner-credentials.service';
import {
  PartnerCredentialSortField,
  SortDirection,
} from './dto/partner-credential-list-query.dto';
import {
  PartnerCredentialStatus,
  PartnerType,
} from './entities/partner-credential.entity';

describe('PartnerCredentialsController', () => {
  let controller: PartnerCredentialsController;
  let partnerCredentialsService: {
    findAll: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(async () => {
    partnerCredentialsService = {
      findAll: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PartnerCredentialsController],
      providers: [
        {
          provide: PartnerCredentialsService,
          useValue: partnerCredentialsService,
        },
      ],
    }).compile();

    controller = module.get(PartnerCredentialsController);
  });

  it('maps admin list responses to the documented DTO shape without raw keyHash', async () => {
    partnerCredentialsService.findAll.mockResolvedValue({
      items: [
        {
          id: 9,
          name: 'POS Link',
          partnerType: PartnerType.POS,
          branchId: 3,
          branch: {
            id: 3,
            name: 'Main Branch',
            code: 'MB-01',
            city: 'Mogadishu',
            country: 'Somalia',
          },
          scopes: ['sync:write'],
          keyHash: 'should-not-be-exposed',
          status: PartnerCredentialStatus.ACTIVE,
          createdAt: new Date('2026-03-16T00:00:00.000Z'),
          updatedAt: new Date('2026-03-16T01:00:00.000Z'),
        },
      ],
      total: 1,
      page: 2,
      perPage: 10,
      totalPages: 1,
    });

    const result = await controller.findAll({
      page: 2,
      limit: 10,
      partnerType: PartnerType.POS,
      sortBy: PartnerCredentialSortField.NAME,
      sortDirection: SortDirection.ASC,
      secondarySortBy: PartnerCredentialSortField.STATUS,
      secondarySortDirection: SortDirection.DESC,
    });

    expect(partnerCredentialsService.findAll).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      partnerType: PartnerType.POS,
      sortBy: PartnerCredentialSortField.NAME,
      sortDirection: SortDirection.ASC,
      secondarySortBy: PartnerCredentialSortField.STATUS,
      secondarySortDirection: SortDirection.DESC,
    });
    expect(result).toEqual(
      expect.objectContaining({
        total: 1,
        page: 2,
        perPage: 10,
        items: [
          expect.objectContaining({
            id: 9,
            name: 'POS Link',
            partnerType: PartnerType.POS,
            branchId: 3,
            branch: {
              id: 3,
              name: 'Main Branch',
              code: 'MB-01',
              city: 'Mogadishu',
              country: 'Somalia',
            },
            scopes: ['sync:write'],
            status: PartnerCredentialStatus.ACTIVE,
          }),
        ],
      }),
    );
    expect(result.items[0]).not.toHaveProperty('keyHash');
  });

  it('maps create responses to the documented DTO shape without raw keyHash', async () => {
    partnerCredentialsService.create.mockResolvedValue({
      id: 10,
      name: 'POS Link',
      partnerType: PartnerType.POS,
      branchId: 3,
      branch: null,
      scopes: ['sync:write'],
      keyHash: 'should-not-be-exposed',
      status: PartnerCredentialStatus.ACTIVE,
      createdAt: new Date('2026-03-16T00:00:00.000Z'),
      updatedAt: new Date('2026-03-16T01:00:00.000Z'),
    });

    const result = await controller.create({
      name: 'POS Link',
      partnerType: PartnerType.POS,
      branchId: 3,
      scopes: ['sync:write'],
      keyHash: 'secret',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 10,
        name: 'POS Link',
        partnerType: PartnerType.POS,
        branchId: 3,
        branch: null,
        scopes: ['sync:write'],
        status: PartnerCredentialStatus.ACTIVE,
      }),
    );
    expect(result).not.toHaveProperty('keyHash');
  });
});
