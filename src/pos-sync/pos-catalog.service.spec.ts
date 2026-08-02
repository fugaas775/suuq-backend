import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import { Branch } from '../branches/entities/branch.entity';
import { ProductAlias } from '../product-aliases/entities/product-alias.entity';
import { Product } from '../products/entities/product.entity';
import { PosCatalogService } from './pos-catalog.service';

/**
 * The scan/search path never joined the branch catalog link, so a RETAIL item
 * priced at the counter still rang up at the supplier's product price — and the
 * register had no way to tell that a PO-received SKU was still unpriced.
 */
describe('PosCatalogService — branch retail pricing', () => {
  let service: PosCatalogService;
  let branchesRepository: { findOne: jest.Mock };
  let rawRows: Record<string, unknown>[];

  const queryBuilder = () => {
    const builder: Record<string, unknown> = {};
    for (const method of [
      'leftJoin',
      'where',
      'andWhere',
      'select',
      'orderBy',
      'addOrderBy',
      'setParameters',
      'take',
    ]) {
      builder[method] = jest.fn(() => builder);
    }
    builder.getRawMany = jest.fn(async () => rawRows);
    return builder;
  };

  const row = (overrides: Record<string, unknown> = {}) => ({
    product_id: 501,
    product_name: 'Supplier Flour 50kg',
    product_sku: 'FLOUR-50',
    product_image_url: null,
    product_currency: 'ETB',
    product_price: 1300, // the supplier's wholesale price
    product_sale_price: null,
    product_attributes: null,
    alias_type: null,
    alias_value: null,
    inventory_available_to_sell: 5,
    inventory_safety_stock: 1,
    link_retail_price: 1800, // what this branch actually sells it for
    link_retail_sale_price: null,
    link_source: 'PURCHASE_ORDER',
    ...overrides,
  });

  const search = () =>
    service.search({ branchId: 3, query: 'flour', limit: 12 });

  beforeEach(async () => {
    rawRows = [row()];
    branchesRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 3,
        retailTenantId: 9,
        serviceFormat: 'RETAIL',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosCatalogService,
        { provide: getRepositoryToken(Branch), useValue: branchesRepository },
        {
          provide: getRepositoryToken(Product),
          useValue: { createQueryBuilder: jest.fn(() => queryBuilder()) },
        },
        { provide: getRepositoryToken(ProductAlias), useValue: {} },
        { provide: getRepositoryToken(BranchInventory), useValue: {} },
      ],
    }).compile();

    service = module.get(PosCatalogService);
  });

  it('prices a RETAIL scan from the branch retail price, not the vendor price', async () => {
    const result = await search();

    expect(result.items[0].unitPrice).toBe(1800);
  });

  it('prefers the branch retail SALE price when one is set', async () => {
    rawRows = [row({ link_retail_sale_price: 1500 })];

    const result = await search();

    expect(result.items[0].unitPrice).toBe(1500);
  });

  it('falls back to the product price when the branch has not priced it', async () => {
    rawRows = [row({ link_retail_price: null, link_retail_sale_price: null })];

    const result = await search();

    expect(result.items[0].unitPrice).toBe(1300);
  });

  it('uses the raw product price for a non-RETAIL branch (isolation)', async () => {
    branchesRepository.findOne.mockResolvedValue({
      id: 3,
      retailTenantId: 9,
      serviceFormat: 'GROCERY',
    });

    const result = await search();

    expect(result.items[0].unitPrice).toBe(1300);
  });

  it('emits the catalog-link provenance the register needs to refuse unpriced goods', async () => {
    rawRows = [row({ link_retail_price: null })];

    const result = await search();

    expect(result.items[0].retailPrice).toBeNull();
    expect(result.items[0].catalogLinkSource).toBe('PURCHASE_ORDER');
  });
});
