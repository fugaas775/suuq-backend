import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ProductsService } from '../src/products/products.service';
import { UserRole } from '../src/auth/roles.enum';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const productsService = app.get(ProductsService);

  const productId = 282; // Isuzu Truck for Rent

  console.log('--- Starting Debug Feature Expiry ---');

  // Helper to print state
  const printState = async (label: string) => {
    const product = await productsService.findOne(productId);
    console.log(
      `${label}: Featured=${product.featured}, Expires=${product.featuredExpiresAt}`,
    );
  };

  await printState('Initial State');

  // Test 1: Toggle unfeature using toggleFeatureStatus (Admin Code path)
  console.log('\n--- Test 1: Admin Toggle OFF ---');
  await productsService.toggleFeatureStatus(productId, false);
  await printState('After Toggle OFF');

  // Test 2: Toggle feature using toggleFeatureStatus (Admin Code path)
  console.log('\n--- Test 2: Admin Toggle ON ---');
  await productsService.toggleFeatureStatus(productId, true);
  await printState('After Toggle ON');

  // Test 3: Unfeature via updateProduct (Vendor Code path)
  console.log('\n--- Test 3: UpdateProduct OFF ---');
  // Need to get vendor ID
  const p = await productsService.findOne(productId);
  const mockUser = { id: p.vendor.id, roles: [UserRole.VENDOR] } as any;

  await productsService.updateProduct(
    productId,
    { featured: false } as any,
    mockUser,
  );
  await printState('After UpdateProduct OFF');

  // Test 4: Feature via updateProduct (Vendor Code path)
  console.log('\n--- Test 4: UpdateProduct ON ---');
  await productsService.updateProduct(
    productId,
    { featured: true } as any,
    mockUser,
  );
  await printState('After UpdateProduct ON');

  await app.close();
}

bootstrap();
