import { Test, TestingModule } from '@nestjs/testing';
import { AdminProductsController } from './products.admin.controller';
import { ProductsService } from '../products/products.service';

describe('AdminProductsController', () => {
  let controller: AdminProductsController;
  let productsService: {
    searchBasic: jest.Mock;
    listForAdmin: jest.Mock;
    listLeafSubcategories: jest.Mock;
  };

  beforeEach(async () => {
    productsService = {
      searchBasic: jest.fn().mockResolvedValue([]),
      listForAdmin: jest
        .fn()
        .mockResolvedValue({ items: [], total: 0, page: 1, perPage: 20 }),
      listLeafSubcategories: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminProductsController],
      providers: [{ provide: ProductsService, useValue: productsService }],
    }).compile();

    controller = module.get(AdminProductsController);
  });

  it('forwards validated admin product list filters', async () => {
    await controller.list({
      status: 'pending_approval',
      page: 2,
      per_page: 25,
      q: 'acme',
      featured: true,
    });

    expect(productsService.listForAdmin).toHaveBeenCalledWith({
      status: 'pending_approval',
      page: 2,
      perPage: 25,
      q: 'acme',
      featured: true,
    });
  });

  it('forwards validated leaf-subcategory filters', async () => {
    await controller.listLeafSubcategories({
      parentId: 17,
      q: 'milk',
      limit: 300,
    });

    expect(productsService.listLeafSubcategories).toHaveBeenCalledWith({
      parentId: 17,
      q: 'milk',
      limit: 300,
    });
  });
});
