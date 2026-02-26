import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ProductsService } from '../src/products/products.service';
import { OrdersService } from '../src/orders/orders.service';
import { EmailService } from '../src/email/email.service';
import { CreateProductDto } from '../src/products/dto/create-product.dto';
import { CreateOrderDto } from '../src/orders/dto/create-order.dto';
import { User } from '../src/users/entities/user.entity';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../src/auth/roles.enum';
import { Product } from '../src/products/entities/product.entity';
import { Category } from '../src/categories/entities/category.entity';
import { Order } from '../src/orders/entities/order.entity';
import { closeE2eApp } from './utils/e2e-cleanup';

const waitFor = async (
  condition: () => boolean,
  timeoutMs = 2000,
  intervalMs = 25,
) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for async condition');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};

describe('Attributes Regression (e2e)', () => {
  let moduleFixture: TestingModule;
  let app: INestApplication;
  let productsService: ProductsService;
  let ordersService: OrdersService;
  let emailService: EmailService;
  let dataSource: DataSource;
  let userRepo: Repository<User>;
  let productRepo: Repository<Product>;
  let orderRepo: Repository<Order>;
  let categoryRepo: Repository<Category>;

  let vendor: User;
  let customer: User;
  let category: Category;

  const emailServiceMock = {
    sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    sendVendorNewOrderEmail: jest.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    initTransport: jest.fn(),
  };

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue(emailServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    productsService = app.get(ProductsService);
    ordersService = app.get(OrdersService);
    emailService = app.get(EmailService);
    userRepo = dataSource.getRepository(User);
    productRepo = dataSource.getRepository(Product);
    orderRepo = dataSource.getRepository(Order);
    categoryRepo = dataSource.getRepository(Category);
  });

  afterAll(async () => {
    // Data cleanup
    if (customer) {
      await orderRepo.delete({ user: { id: customer.id } });
      await userRepo.delete(customer.id);
    }
    if (vendor) {
      await productRepo.delete({ vendor: { id: vendor.id } });
      await userRepo.delete(vendor.id);
    }
    if (category) {
      await categoryRepo.delete(category.id);
    }

    // Open-handles cleanup
    delete (global as any).testProduct;
    jest.clearAllMocks();
    jest.restoreAllMocks();

    await closeE2eApp({ app, moduleFixture, dataSource });
  });

  it('should create a product with multi-select attributes', async () => {
    // 0. Create Category
    category = categoryRepo.create({
        name: 'Test Cat',
        slug: `test-cat-${Date.now()}`,
    });
    category = await categoryRepo.save(category);

    // 1. Create Vendor
    vendor = userRepo.create({
      email: `vendor-${Date.now()}@test.com`,
      password: 'password',
      displayName: 'Test Vendor',
      roles: [UserRole.VENDOR],
      verified: true,
      currency: 'ETB',
      phoneNumber: '+251911223344',
    });
    vendor = await userRepo.save(vendor);

    // 2. Create Product with Array Attributes
    const createDto: CreateProductDto = {
      name: 'Multi-Select Shirt',
      price: 500,
      currency: 'ETB',
      description: 'A nice shirt with options',
      attributes: {
        Color: ['Red', 'Blue'],
        Size: ['M', 'L', 'XL'],
        Material: 'Cotton', // Mixed types test
      },
      status: 'publish',
      categoryId: category.id,
    };

    const product = await productsService.create({
      ...createDto,
      vendorId: vendor.id,
    });

    expect(product).toBeDefined();
    expect(product.id).toBeGreaterThan(0);
    expect(product.attributes).toBeDefined();
    expect(Array.isArray(product.attributes['Color'])).toBe(true);
    expect(product.attributes['Color']).toContain('Red');
    expect(product.attributes['Color']).toContain('Blue');
    expect(product.attributes['Size']).toHaveLength(3);
    
    // 3. Verify DB Persistence
    const dbProduct = await productRepo.findOne({ where: { id: product.id } });
    expect(dbProduct.attributes).toEqual(expect.objectContaining({
        Color: ['Red', 'Blue'],
        Size: ['M', 'L', 'XL'],
    }));

    // Store for next test
    (global as any).testProduct = product;
  });

  it('should create an order with selected attributes and trigger email', async () => {
    emailServiceMock.sendOrderConfirmation.mockClear();
    emailServiceMock.sendVendorNewOrderEmail.mockClear();

    const product = (global as any).testProduct as Product;
    expect(product).toBeDefined();

    // 1. Create Customer
    customer = userRepo.create({
      email: `customer-${Date.now()}@test.com`,
      password: 'password',
      displayName: 'Test Customer',
      roles: [UserRole.CUSTOMER],
      phoneNumber: '+254712345678',
      currency: 'KES',
    });
    customer = await userRepo.save(customer);

    // 2. Create Order
    const createOrderDto: CreateOrderDto = {
      items: [
        {
          productId: product.id,
          quantity: 2,
          attributes: {
            Color: 'Red', // User selected just one, or maybe an array if UI allows (usually single selection for cart)
            // backend should support whatever is passed
            CustomOption: ['A', 'B'] // Let's test array passing to order too
          },
        },
      ],
      paymentMethod: 'COD',
      shippingAddress: {
        fullName: 'John Doe',
        address: '123 St',
        city: 'Nairobi',
        country: 'Kenya',
        phoneNumber: '+254712345678',
      },
    };

    const order = await ordersService.createFromCart(
      customer.id,
      createOrderDto,
      customer.currency,
    );

    expect(order).toBeDefined();
    expect(order.items).toHaveLength(1);
    expect(order.items[0].attributes).toEqual(expect.objectContaining({
        Color: 'Red',
        CustomOption: ['A', 'B'],
    }));

    // 3. Check Email Service Call
    await waitFor(() => emailServiceMock.sendOrderConfirmation.mock.calls.length > 0);
    expect(emailServiceMock.sendOrderConfirmation).toHaveBeenCalled();
    const callArgs = emailServiceMock.sendOrderConfirmation.mock.calls[0][0];
    expect(callArgs.id).toBe(order.id);
    expect(callArgs.items[0].attributes).toEqual(expect.objectContaining({
        Color: 'Red',
    }));

    // 4. Check Vendor Notification
    await waitFor(() => emailServiceMock.sendVendorNewOrderEmail.mock.calls.length > 0);
    expect(emailServiceMock.sendVendorNewOrderEmail).toHaveBeenCalled();
    const vendorArgs = emailServiceMock.sendVendorNewOrderEmail.mock.calls[0]; // (email, name, orderId, items, currency)
    // 4th arg is items
    const vendorItems = vendorArgs[3];
    expect(vendorItems[0].attributes).toEqual(expect.objectContaining({
        Color: 'Red',
    }));
  });
});
