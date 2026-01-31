import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ProductsService } from '../src/products/products.service';
import { UpdateProductDto } from '../src/products/dto/update-product.dto';
import { UserRole } from '../src/auth/roles.enum';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const productsService = app.get(ProductsService);

  const productId = 215; // Premium Web Development Services

  console.log('--- Debug: Simulating Flutter Update with 7-Day Boost ---');

  // 1. Fetch current state
  const initial = await productsService.findOne(productId);
  console.log(
    `Initial: Featured=${initial.featured}, Expires=${initial.featuredExpiresAt}`,
  );

  // 2. Prepare payload mimicking Flutter (ValidationPipe runs before Controller,
  // but Service receives DTO. We must manually construct DTO state as if validated)
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 7); // 7 days from now

  const updateDto = new UpdateProductDto();
  updateDto.featured = true;
  updateDto.featuredExpiresAt = targetDate;

  // Need a vendor user
  const mockUser = { id: initial.vendor.id, roles: [UserRole.VENDOR] } as any;

  console.log(
    `\nSending Payload: featured=true, featuredExpiresAt=${targetDate.toISOString()}`,
  );

  // 3. Call updateProduct
  try {
    const updated = await productsService.updateProduct(
      productId,
      updateDto,
      mockUser,
    );

    console.log(`\nResult: Featured=${updated.featured}`);
    console.log(`Result: Expires=${updated.featuredExpiresAt}`);

    const savedDate = updated.featuredExpiresAt
      ? new Date(updated.featuredExpiresAt).getTime()
      : 0;
    const sentDate = targetDate.getTime();
    const diff = Math.abs(savedDate - sentDate);

    // Allow small delta for db precision
    if (diff < 1000) {
      console.log('\nSUCCESS: Expiry date was saved exactly as sent.');
    } else {
      console.log(`\nFAILURE: Dates mismatch! Diff=${diff}ms`);
      // Check if it looks like 3 days (approx 259200000 ms)
      const now = Date.now();
      const expiryToNow = savedDate - now;
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      if (Math.abs(expiryToNow - threeDays) < 60000) {
        console.log('Use appears to have been defaulted to 3 days.');
      }
    }
  } catch (error) {
    console.error('Error updating product:', error);
  }

  await app.close();
}

bootstrap();
