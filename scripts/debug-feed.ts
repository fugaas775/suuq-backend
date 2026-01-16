
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ProductRequestsService } from '../src/product-requests/product-requests.service';
import { UserRole } from '../src/auth/roles.enum';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(ProductRequestsService);

  const sellerId = 128;
  const sellerRoles = [UserRole.VENDOR]; // Assuming 'vendor' is the string or enum
  
  console.log('--- Testing listSellerFeed ---');
  try {
    const feed = await service.listSellerFeed(sellerId, sellerRoles as any, { limit: 10, page: 1 });
    console.log(`Feed count: ${feed.length}`);
    feed.forEach(r => {
        console.log(`- Req #${r.id} (Buyer ${r.buyerId}) [Status: ${r.status}]`);
    });
    
    const req32 = feed.find(r => r.id === 32);
    if (req32) {
        console.log('SUCCESS: Request 32 is in the feed.');
    } else {
        console.log('FAILURE: Request 32 is NOT in the feed.');
    }
  } catch (e) {
      console.error('Error in listSellerFeed:', e);
  }

  console.log('\n--- Testing listForwardedToSeller ---');
  try {
    const forwarded = await service.listForwardedToSeller(sellerId, sellerRoles as any, { limit: 10, page: 1 });
    console.log(`Forwarded count: ${forwarded.items.length} (Total: ${forwarded.total})`);
    forwarded.items.forEach((r: any) => {
        console.log(`- Req #${r.id}`);
    });

    const req32F = forwarded.items.find((r: any) => r.id === 32);
     if (req32F) {
        console.log('SUCCESS: Request 32 is in the forwarded list.');
    } else {
        console.log('FAILURE: Request 32 is NOT in the forwarded list.');
    }

  } catch (e) {
      console.error('Error in listForwardedToSeller:', e);
  }

  await app.close();
}

bootstrap();
