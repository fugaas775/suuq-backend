import { Test, TestingModule } from '@nestjs/testing';
import { ProductAliasesController } from './product-aliases.controller';
import { ProductAliasesService } from './product-aliases.service';
import { ProductAliasType } from './entities/product-alias.entity';

describe('ProductAliasesController', () => {
  let controller: ProductAliasesController;
  let productAliasesService: {
    importAliases: jest.Mock;
  };

  beforeEach(async () => {
    productAliasesService = {
      importAliases: jest.fn().mockResolvedValue({
        tenantId: 5,
        totalRows: 1,
        createdCount: 1,
        failedCount: 0,
        createdAliasIds: [91],
        failures: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductAliasesController],
      providers: [
        { provide: ProductAliasesService, useValue: productAliasesService },
      ],
    }).compile();

    controller = module.get(ProductAliasesController);
  });

  it('delegates alias import requests to the product alias service', async () => {
    await controller.import({
      tenantId: 5,
      rows: [
        {
          productId: 77,
          aliasType: ProductAliasType.LOCAL_SKU,
          aliasValue: 'sku-001',
        },
      ],
    });

    expect(productAliasesService.importAliases).toHaveBeenCalledWith({
      tenantId: 5,
      rows: [
        {
          productId: 77,
          aliasType: ProductAliasType.LOCAL_SKU,
          aliasValue: 'sku-001',
        },
      ],
    });
  });
});
