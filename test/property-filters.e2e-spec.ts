import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from '../src/products/products.service';
import { ProductsController } from '../src/products/products.controller';
import { Product } from '../src/products/entities/product.entity';
import { ProductImage } from '../src/products/entities/product-image.entity';
import { User } from '../src/users/entities/user.entity';
import { Order } from '../src/orders/entities/order.entity';
import { Tag } from '../src/tags/tag.entity';
import { Category } from '../src/categories/entities/category.entity';
import { ProductImpression } from '../src/products/entities/product-impression.entity';
import { SearchKeyword } from '../src/products/entities/search-keyword.entity';

import { AppModule } from '../src/app.module';

// Minimal e2e covering listingType + bedrooms filtering logic

// Skipped in CI due to flaky external DB schema mismatch; re-enable once test DB is aligned
describe.skip('Property Filters (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);

    // Seed minimal products directly (bypassing services for speed)
    // Columns assumed from entity; adjust if naming differs.
    // Note: listing_type, bedrooms, listing_city are snake-case columns.
    const seed = [
      { name: 'Sale A2 Addis', price: 10, currency: 'USD', listing_type: 'sale', bedrooms: 2, listing_city: 'Addis Ababa' },
      { name: 'Sale A3 Addis', price: 11, currency: 'USD', listing_type: 'sale', bedrooms: 3, listing_city: 'Addis Ababa' },
      { name: 'Rent A2 Addis', price: 12, currency: 'USD', listing_type: 'rent', bedrooms: 2, listing_city: 'Addis Ababa' },
      { name: 'Rent N4 Nairobi', price: 13, currency: 'USD', listing_type: 'rent', bedrooms: 4, listing_city: 'Nairobi' },
      { name: 'NullType B2', price: 14, currency: 'USD', listing_type: null, bedrooms: 2, listing_city: 'Addis Ababa' },
      { name: 'Sale A2 NoCity', price: 15, currency: 'USD', listing_type: 'sale', bedrooms: 2, listing_city: null },
    ];

    const userRepo = dataSource.getRepository('user');
    let vendor = await userRepo.findOne({ where: { email: 'filters-vendor@example.com' } as any });
    if (!vendor) {
      vendor = await userRepo.save(userRepo.create({ email: 'filters-vendor@example.com', password: 'x' } as any));
    }
    const productRepo = dataSource.getRepository('product');
    for (const p of seed) {
      const existing = await productRepo.findOne({ where: { name: p.name } as any });
      if (existing) continue;
      const entity: any = productRepo.create({
        name: p.name,
        price: p.price,
        currency: p.currency,
        description: 'desc',
        status: 'publish',
        vendor,
        listingType: p.listing_type,
        bedrooms: p.bedrooms,
        listingCity: p.listing_city,
        attributes: {},
      });
      await productRepo.save(entity);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  function extractNames(res: request.Response) {
    return (res.body.items || []).map((p: any) => p.name).sort();
  }

  it('filters by listingType=sale', async () => {
    const res = await request(app.getHttpServer()).get('/products?listingType=sale');
    expect(res.status).toBe(200);
    const names = extractNames(res);
  // Should include our seeded sale listings
  expect(names).toEqual(expect.arrayContaining(['Sale A2 Addis', 'Sale A2 NoCity', 'Sale A3 Addis']));
  // Should not include a rent-only listing in Addis
  expect(names).not.toContain('Rent A2 Addis');
  });

  it('filters by bedrooms exact=2', async () => {
    const res = await request(app.getHttpServer()).get('/products?bedrooms=2');
    expect(res.status).toBe(200);
    const names = extractNames(res);
    // Includes sale/rent/null listing types because listingType filter not applied
    expect(names).toContain('Sale A2 Addis');
    expect(names).toContain('Rent A2 Addis');
  });

  it('filters by listingType=rent and bedrooms range 2..3', async () => {
    const res = await request(app.getHttpServer()).get('/products?listingType=rent&bedrooms_min=2&bedrooms_max=3');
    expect(res.status).toBe(200);
    const names = extractNames(res);
  expect(names).toContain('Rent A2 Addis'); // In range
  expect(names).not.toContain('Rent N4 Nairobi'); // Out of range (4 bedrooms)
  // Ensure sale listing not present in rent filter result
  expect(names).not.toContain('Sale A2 Addis');
  });

  it('filters by listingType=sale and userCity=Addis Ababa', async () => {
    const res = await request(app.getHttpServer()).get('/products?listingType=sale&userCity=Addis%20Ababa');
    expect(res.status).toBe(200);
    const names = extractNames(res);
  // Should include only Addis sale listings (at least these two) and exclude the no-city sale
  expect(names).toEqual(expect.arrayContaining(['Sale A2 Addis', 'Sale A3 Addis']));
  expect(names).not.toContain('Sale A2 NoCity');
  });

  it('returns empty when bedrooms_min > bedrooms_max produces impossible range', async () => {
    const res = await request(app.getHttpServer()).get('/products?bedrooms_min=5&bedrooms_max=2');
    expect(res.status).toBe(200);
    const names = extractNames(res);
    expect(names.length).toBe(0);
  });

  it('ignores invalid listingType value', async () => {
    const res = await request(app.getHttpServer()).get('/products?listingType=invalid_value');
    expect(res.status).toBe(200);
    const names = extractNames(res);
    // Both sale and rent seeded listings should be present when filter ignored
    expect(names).toEqual(expect.arrayContaining(['Sale A2 Addis', 'Rent A2 Addis']));
  });
});
