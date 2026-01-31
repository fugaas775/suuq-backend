import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ProductsService } from '../src/products/products.service';
import { PaymentsController } from '../src/payments/payments.controller';
import { TelebirrService } from '../src/telebirr/telebirr.service';
import { UserRole } from '../src/auth/roles.enum';
import { Product } from '../src/products/entities/product.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TelebirrTransaction } from '../src/payments/entities/telebirr-transaction.entity';
import { INestApplicationContext } from '@nestjs/common';

async function bootstrap() {
  console.log('--- Starting Boost Flow Verification ---');

  const app: INestApplicationContext =
    await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'], // Quiet logs
    });

  const productsService = app.get(ProductsService);
  const paymentsController = app.get(PaymentsController);
  const telebirrService = app.get(TelebirrService);
  const txRepo = app.get(getRepositoryToken(TelebirrTransaction));
  const productRepo = app.get(getRepositoryToken(Product));

  // 1. Monkey-Patch verifySignature to bypass crypto check for this test
  const originalVerify = telebirrService.verifySignature;
  telebirrService.verifySignature = () => {
    console.log(
      '[Mock] TelebirrService.verifySignature called -> Returning TRUE',
    );
    return true;
  };

  // Mock createOrder to avoid actual network call to Telebirr
  telebirrService.createOrder = async () => {
    console.log('[Mock] TelebirrService.createOrder called');
    return { toPayUrl: 'http://mock-url' };
  };

  try {
    // 2. Setup: Find a product and vendor
    const targetProduct = await productRepo.findOne({
      where: { isBlocked: false, status: 'publish' },
      relations: ['vendor'],
    });

    if (!targetProduct) {
      console.error('No products found to test with.');
      return;
    }

    console.log(
      `\nTarget Product: ID=${targetProduct.id}, Name="${targetProduct.name}"`,
    );
    console.log(
      `Initial Featured Status: ${targetProduct.featured}, Expires=${targetProduct.featuredExpiresAt}`,
    );

    // Login simulation
    const mockReq = {
      user: {
        id: targetProduct.vendor.id,
        roles: [UserRole.VENDOR],
        email: 'test@vendor.com',
        phoneNumber: '+251911223344',
      },
    };

    // 3. Initiate Boost
    console.log('\n--- Step 1: Initiating Boost (Popular Tier - 3 Days) ---');
    const initResult = await paymentsController.initiateBoostPayment(
      { productId: targetProduct.id, tier: 'popular', provider: 'TELEBIRR' },
      mockReq,
    );

    console.log('Initiate Result:', initResult);
    const merchOrderId = initResult.merchOrderId;

    if (!merchOrderId) {
      throw new Error('Failed to get merchOrderId');
    }

    // Verify DB Record
    const pendingTx = await txRepo.findOne({
      where: { merch_order_id: merchOrderId },
    });
    console.log(
      'Pending Transaction in DB:',
      pendingTx ? 'FOUND' : 'MISSING',
      pendingTx?.status,
    );

    if (!pendingTx) throw new Error('Transaction record not created');

    // 4. Simulate Callback
    console.log('\n--- Step 2: Simulating Telebirr Callback ---');
    const mockCallbackBody = {
      outTradeNo: merchOrderId,
      tradeStatus: 'Success',
      tradeNo: 'TEL-SIMULATED-123456',
      transactionId: 'TEL-SIMULATED-123456',
      sign: 'MOCK_SIGNATURE', // Will be ignored by patched verifySignature
    };

    const callbackResult =
      await paymentsController.telebirrCallback(mockCallbackBody);
    console.log('Callback Result:', callbackResult);

    // 5. Verify Outcome
    console.log('\n--- Step 3: Verifying Product State ---');
    const updatedProduct = await productsService.findOne(targetProduct.id);

    console.log(`Updated Featured Status: ${updatedProduct.featured}`);
    console.log(`Updated Expiry: ${updatedProduct.featuredExpiresAt}`);

    const now = Date.now();
    const expiry = updatedProduct.featuredExpiresAt
      ? new Date(updatedProduct.featuredExpiresAt).getTime()
      : 0;
    const diffDays = (expiry - now) / (1000 * 60 * 60 * 24);

    console.log(`Expiry is in ~${diffDays.toFixed(1)} days`);

    if (updatedProduct.featured && diffDays > 2.9 && diffDays < 3.1) {
      console.log('\n✅ SUCCESS: Product boosted correctly for ~3 days.');
    } else {
      console.error('\n❌ FAILURE: Product state is incorrect.');
    }

    // Cleanup: Revert status?
    // Maybe verify Ebirr path too?
  } catch (e) {
    console.error('Test Failed:', e);
  } finally {
    await app.close();
  }
}

bootstrap();
