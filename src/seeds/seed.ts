import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module'; // Use AppModule, not SeedsModule!
import { SeedService } from './seed.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const productName = process.argv[2] || 'Sample Product';
  const imageCount = Number(process.argv[3]) || 3;

  const seeder = app.get(SeedService);
  await seeder.seed(productName, imageCount);

  await app.close();
  process.exit(0);
}

bootstrap().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
