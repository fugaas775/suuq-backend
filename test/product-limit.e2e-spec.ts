import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DataSource, Repository } from 'typeorm';
import { ProductsService } from '../src/products/products.service';
import { User } from '../src/users/entities/user.entity';
import { Product } from '../src/products/entities/product.entity';
import { UserRole } from '../src/auth/roles.enum';
import { CreateProductDto } from '../src/products/dto/create-product.dto';

describe('Product Limits (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let productsService: ProductsService;
  let userRepo: Repository<User>;
  let productRepo: Repository<Product>;
  let vendor: User;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    dataSource = app.get(DataSource);
    productsService = app.get(ProductsService);
    userRepo = dataSource.getRepository(User);
    productRepo = dataSource.getRepository(Product);
  });

  afterAll(async () => {
    if (vendor) {
        await productRepo.delete({ vendor: { id: vendor.id } });
        await userRepo.delete(vendor.id);
    }
    await app.close();
  });

  it('should limit unverified vendors to 5 products', async () => {
    // 1. Create Uncertified Vendor
    const email = `limit-test-${Date.now()}@example.com`;
    vendor = userRepo.create({
      email,
      password: 'password123',
      displayName: 'Limit Tester',
      roles: [UserRole.VENDOR],
      verified: false, // Critical: Unverified
      currency: 'ETB',
      phoneNumber: '+251911223344',
    });
    vendor = await userRepo.save(vendor);

    // 2. Create 5 Products
    const baseDto: CreateProductDto = {
        name: 'Test Product',
        price: 100,
        description: 'Test Desc',
        currency: 'ETB',
    };

    for (let i = 0; i < 5; i++) {
        await productsService.create({
            ...baseDto,
            name: `Product ${i+1}`,
            vendorId: vendor.id
        });
    }

    // Verify 5 exist
    const count = await productRepo.count({ where: { vendor: { id: vendor.id } } });
    expect(count).toBe(5);

    // 3. Attempt 6th Product -> Should Fail
    await expect(
        productsService.create({
            ...baseDto,
            name: 'Product 6',
            vendorId: vendor.id
        })
    ).rejects.toThrow(ForbiddenException);

    // 4. Verify Vendor (Certify)
    vendor.verified = true;
    await userRepo.save(vendor);

    // 5. Attempt 6th Product -> Should Succeed
    const p6 = await productsService.create({
        ...baseDto,
        name: 'Product 6',
        vendorId: vendor.id
    });
    expect(p6).toBeDefined();

    // Verify 6 exist
    const countAfter = await productRepo.count({ where: { vendor: { id: vendor.id } } });
    expect(countAfter).toBe(6);
  });
});
