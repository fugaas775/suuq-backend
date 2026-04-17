import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request from 'supertest';
import { RolesGuard } from '../src/auth/roles.guard';
import { AdminProductsController } from '../src/admin/products.admin.controller';
import { ProductsService } from '../src/products/products.service';

describe('AdminProductsController query contract (e2e)', () => {
  let app: INestApplication;
  let productsService: {
    searchBasic: jest.Mock;
    findOneForAdmin: jest.Mock;
    listForAdmin: jest.Mock;
    listPendingApproval: jest.Mock;
    listLeafSubcategories: jest.Mock;
    approveProduct: jest.Mock;
    rejectProduct: jest.Mock;
    adminSetFeatured: jest.Mock;
    adminChangeSubcategory: jest.Mock;
    adminUpdatePosCatalog: jest.Mock;
    bulkApprove: jest.Mock;
    bulkReject: jest.Mock;
    softDeleteByAdmin: jest.Mock;
    restoreByAdmin: jest.Mock;
    hardDeleteByAdmin: jest.Mock;
  };

  beforeAll(async () => {
    productsService = {
      searchBasic: jest.fn().mockResolvedValue([]),
      findOneForAdmin: jest.fn().mockResolvedValue({
        id: 7,
        name: 'Acme Product',
        attributes: {
          aliases: ['coffee', 'buna'],
          localizedNames: { en: 'Coffee', am: 'Buna' },
          packagingChargeAmount: 12,
        },
      }),
      listForAdmin: jest.fn().mockResolvedValue({
        items: [{ id: 7, name: 'Acme Product' }],
        total: 1,
        page: 2,
        perPage: 25,
      }),
      listPendingApproval: jest.fn().mockResolvedValue([]),
      listLeafSubcategories: jest.fn().mockResolvedValue([
        {
          id: 9,
          name: 'Leaf',
          slug: 'leaf',
          label: 'Parent > Leaf',
          parent: { id: 2, name: 'Parent', slug: 'parent' },
        },
      ]),
      approveProduct: jest.fn(),
      rejectProduct: jest.fn(),
      adminSetFeatured: jest.fn(),
      adminChangeSubcategory: jest.fn(),
      adminUpdatePosCatalog: jest.fn().mockResolvedValue({
        id: 7,
        name: 'Acme Product',
        attributes: {
          aliases: ['coffee', 'buna'],
          localizedNames: { en: 'Coffee', am: 'Buna' },
          packagingChargeAmount: 12,
          browseCategory: 'COFFEE',
          unitOfMeasure: 'CUP',
        },
      }),
      bulkApprove: jest.fn(),
      bulkReject: jest.fn(),
      softDeleteByAdmin: jest.fn(),
      restoreByAdmin: jest.fn(),
      hardDeleteByAdmin: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminProductsController],
      providers: [{ provide: ProductsService, useValue: productsService }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists admin products with validated filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/products')
      .query({
        status: 'pending_approval',
        page: '2',
        per_page: '25',
        q: '  acme  ',
        featured: 'true',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        items: [expect.objectContaining({ id: 7 })],
        page: 2,
        perPage: 25,
      }),
    );
    expect(productsService.listForAdmin).toHaveBeenCalledWith({
      status: 'pending_approval',
      page: 2,
      perPage: 25,
      q: 'acme',
      featured: true,
    });
  });

  it('lists leaf subcategories with validated filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/products/subcategories/leaf')
      .query({ parentId: '17', q: '  milk  ', limit: '300' })
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({ id: 9, label: 'Parent > Leaf' }),
    ]);
    expect(productsService.listLeafSubcategories).toHaveBeenCalledWith({
      parentId: 17,
      q: 'milk',
      limit: 300,
    });
  });

  it('loads one admin product detail with POS metadata', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/products/7')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: 7,
        attributes: expect.objectContaining({
          aliases: ['coffee', 'buna'],
          packagingChargeAmount: 12,
        }),
      }),
    );
    expect(productsService.findOneForAdmin).toHaveBeenCalledWith(7);
  });

  it('updates POS catalog metadata with validated payload', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/admin/products/7/pos-catalog')
      .send({
        browseCategory: 'COFFEE',
        unitOfMeasure: 'CUP',
        packagingChargeAmount: 12,
        aliases: ['coffee', 'buna'],
        localizedNames: { en: 'Coffee', am: 'Buna' },
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: 7,
        attributes: expect.objectContaining({
          browseCategory: 'COFFEE',
          unitOfMeasure: 'CUP',
        }),
      }),
    );
    expect(productsService.adminUpdatePosCatalog).toHaveBeenCalledWith(
      7,
      {
        browseCategory: 'COFFEE',
        unitOfMeasure: 'CUP',
        packagingChargeAmount: 12,
        aliases: ['coffee', 'buna'],
        localizedNames: { en: 'Coffee', am: 'Buna' },
      },
      { actorId: null },
    );
  });

  it('rejects malformed admin product query filters', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/products?page=abc')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/products?per_page=0')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/products?featured=not-real')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/products/subcategories/leaf?parentId=abc')
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/admin/products/subcategories/leaf?limit=5000')
      .expect(400);

    await request(app.getHttpServer())
      .patch('/api/admin/products/7/pos-catalog')
      .send({ packagingChargeAmount: -1 })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/api/admin/products/7/pos-catalog')
      .send({ aliases: 'coffee' })
      .expect(400);
  });
});
