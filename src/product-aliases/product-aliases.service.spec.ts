import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { PartnerCredential } from '../partner-credentials/entities/partner-credential.entity';
import { Product } from '../products/entities/product.entity';
import { RetailTenant } from '../retail/entities/retail-tenant.entity';
import {
  ProductAlias,
  ProductAliasType,
} from './entities/product-alias.entity';
import { ProductAliasesService } from './product-aliases.service';

describe('ProductAliasesService', () => {
  let service: ProductAliasesService;
  let productAliasesRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let retailTenantsRepository: { findOne: jest.Mock };
  let branchesRepository: { findOne: jest.Mock };
  let partnerCredentialsRepository: { findOne: jest.Mock };
  let productsRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    productAliasesRepository = {
      create: jest.fn((value: any) => value),
      save: jest.fn(async (value: any) => ({ id: 91, ...value })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(),
    };
    retailTenantsRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 5 }),
    };
    branchesRepository = {
      findOne: jest.fn(),
    };
    partnerCredentialsRepository = {
      findOne: jest.fn(),
    };
    productsRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 77 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductAliasesService,
        {
          provide: getRepositoryToken(ProductAlias),
          useValue: productAliasesRepository,
        },
        {
          provide: getRepositoryToken(RetailTenant),
          useValue: retailTenantsRepository,
        },
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        {
          provide: getRepositoryToken(PartnerCredential),
          useValue: partnerCredentialsRepository,
        },
        { provide: getRepositoryToken(Product), useValue: productsRepository },
      ],
    }).compile();

    service = module.get(ProductAliasesService);
  });

  it('creates a partner-scoped alias and derives the branch scope from the partner credential', async () => {
    branchesRepository.findOne.mockResolvedValue({
      id: 3,
      retailTenantId: 5,
    });
    partnerCredentialsRepository.findOne.mockResolvedValue({
      id: 11,
      branchId: 3,
    });

    const result = await service.create({
      tenantId: 5,
      partnerCredentialId: 11,
      productId: 77,
      aliasType: ProductAliasType.BARCODE,
      aliasValue: '  1234567890  ',
    });

    expect(result).toEqual(
      expect.objectContaining({
        tenantId: 5,
        branchId: 3,
        partnerCredentialId: 11,
        productId: 77,
        aliasType: ProductAliasType.BARCODE,
        aliasValue: '1234567890',
        normalizedAliasValue: '1234567890',
      }),
    );
  });

  it('prefers partner-scoped aliases over branch and tenant aliases during resolution', async () => {
    branchesRepository.findOne.mockResolvedValue({
      id: 3,
      retailTenantId: 5,
    });
    productAliasesRepository.find.mockResolvedValue([
      {
        id: 1,
        tenantId: 5,
        branchId: null,
        partnerCredentialId: null,
        productId: 77,
      },
      {
        id: 2,
        tenantId: 5,
        branchId: 3,
        partnerCredentialId: null,
        productId: 78,
      },
      {
        id: 3,
        tenantId: 5,
        branchId: 3,
        partnerCredentialId: 11,
        productId: 79,
      },
    ]);

    await expect(
      service.resolveProductIdForBranch(
        3,
        11,
        ProductAliasType.LOCAL_SKU,
        'sku-001',
      ),
    ).resolves.toBe(79);
  });

  it('raises an explicit error when the alias is ambiguous at the same scope', async () => {
    branchesRepository.findOne.mockResolvedValue({
      id: 3,
      retailTenantId: 5,
    });
    productAliasesRepository.find.mockResolvedValue([
      {
        id: 1,
        tenantId: 5,
        branchId: 3,
        partnerCredentialId: null,
        productId: 77,
      },
      {
        id: 2,
        tenantId: 5,
        branchId: 3,
        partnerCredentialId: null,
        productId: 78,
      },
    ]);

    await expect(
      service.resolveProductIdForBranch(
        3,
        null,
        ProductAliasType.BARCODE,
        '1234567890',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('imports aliases in bulk and reports duplicate rows within the batch', async () => {
    branchesRepository.findOne.mockResolvedValue({
      id: 3,
      retailTenantId: 5,
    });

    const result = await service.importAliases({
      tenantId: 5,
      rows: [
        {
          branchId: 3,
          productId: 77,
          aliasType: ProductAliasType.LOCAL_SKU,
          aliasValue: 'sku-001',
        },
        {
          branchId: 3,
          productId: 78,
          aliasType: ProductAliasType.LOCAL_SKU,
          aliasValue: 'SKU-001',
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        tenantId: 5,
        totalRows: 2,
        createdCount: 1,
        failedCount: 1,
        createdAliasIds: [91],
      }),
    );
    expect(result.failures[0]).toEqual(
      expect.objectContaining({
        rowIndex: 1,
        error: 'Alias LOCAL_SKU:SKU-001 is duplicated within this import batch',
      }),
    );
  });

  it('reports existing alias conflicts during import without aborting the whole batch', async () => {
    branchesRepository.findOne.mockResolvedValue({
      id: 3,
      retailTenantId: 5,
    });
    productAliasesRepository.findOne
      .mockResolvedValueOnce({
        id: 22,
        aliasValue: 'sku-existing',
      })
      .mockResolvedValueOnce(null);

    const result = await service.importAliases({
      tenantId: 5,
      rows: [
        {
          branchId: 3,
          productId: 77,
          aliasType: ProductAliasType.LOCAL_SKU,
          aliasValue: 'sku-existing',
        },
        {
          branchId: 3,
          productId: 78,
          aliasType: ProductAliasType.BARCODE,
          aliasValue: '1234567890',
        },
      ],
    });

    expect(result.createdCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.failures[0]).toEqual(
      expect.objectContaining({
        rowIndex: 0,
        error:
          'Alias LOCAL_SKU:sku-existing already exists for the requested scope',
      }),
    );
  });

  it('stops on the first error when continueOnError is false', async () => {
    branchesRepository.findOne.mockResolvedValue({
      id: 3,
      retailTenantId: 5,
    });
    productAliasesRepository.findOne.mockResolvedValue({
      id: 22,
      aliasValue: 'sku-existing',
    });

    const result = await service.importAliases({
      tenantId: 5,
      continueOnError: false,
      rows: [
        {
          branchId: 3,
          productId: 77,
          aliasType: ProductAliasType.LOCAL_SKU,
          aliasValue: 'sku-existing',
        },
        {
          branchId: 3,
          productId: 78,
          aliasType: ProductAliasType.BARCODE,
          aliasValue: '1234567890',
        },
      ],
    });

    expect(result.createdCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(productAliasesRepository.save).not.toHaveBeenCalled();
  });
});
