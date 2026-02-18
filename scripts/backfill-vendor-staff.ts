import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/auth/roles.enum';
import { VendorStaffService } from '../src/vendor/vendor-staff.service';
import { getConnection } from 'typeorm';
import { VendorStaff } from '../src/vendor/entities/vendor-staff.entity';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const vendorStaffService = app.get(VendorStaffService);
  const userStats = { count: 0, created: 0, skipped: 0 };

  console.log('Starting Vendor Staff backfill for Options...');

  // repository access via module or getRepository
  const userRepo = app.get('UserRepository'); // simplistic, might fail if not exported as string
  // Better use EntityManager
  const entityManager = app.get('DataSource').manager; // assuming DataSource is available

  const vendors = await entityManager.find(User, {
    where: {}, // We'll filter in JS or use query builder
  });

  // Filter for vendors manually to avoid complicated array string matching in typeorm find
  const actualVendors = vendors.filter((u: User) =>
    u.roles.includes(UserRole.VENDOR),
  );

  console.log(`Found ${actualVendors.length} vendors.`);

  for (const user of actualVendors) {
    userStats.count++;
    try {
      // Use the service method we just created
      // It handles check-if-exists logic internally
      await vendorStaffService.bootstrapOwner(user);
      process.stdout.write('.');
      userStats.created++;
    } catch (e: any) {
      console.error(`\nFailed for User ${user.id}:`, e.message);
    }
  }

  console.log('\nBackfill complete.');
  console.log(`Processed: ${userStats.count}`);
  console.log(`Updated/Created: ${userStats.created}`);

  await app.close();
}

bootstrap();
