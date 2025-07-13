import { NestFactory } from '@nestjs/core';
import { SeedsModule } from './seeds.module'; // <-- Use our lightweight module
import { SeedService } from './seed.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Seeder');
  logger.log('Bootstrapping seeding module...');

  const app = await NestFactory.createApplicationContext(SeedsModule);
  const seeder = app.get(SeedService);

  // Get command line argument to run a specific seeder
  const args = process.argv.slice(2);
  const seederToRun = args[0];

  if (seederToRun === 'countries') {
    await seeder.seedCountries();
  } else {
    // If no argument is given, run all seeders
    await seeder.seedAll();
  }

  await app.close();
  logger.log('Seeding process finished.');
  process.exit(0);
}

bootstrap().catch((err) => {
  const logger = new Logger('Seeder');
  logger.error('Seeding failed:', err);
  process.exit(1);
});
