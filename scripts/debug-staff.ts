import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VendorStaffService } from '../src/vendor/vendor-staff.service';
import { DataSource } from 'typeorm';
import { VendorStaff } from '../src/vendor/entities/vendor-staff.entity';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const repo = app.get(DataSource).getRepository(VendorStaff);

  const userId = 1; // From logs

  console.log(`\n--- Inspecting VendorStaff for Member #${userId} ---\n`);

  const records = await repo.find({
    where: { member: { id: userId } },
    relations: ['vendor', 'member'],
  });

  if (records.length === 0) {
    console.log('No VendorStaff records found for this user.');
  } else {
    records.forEach((staff, index) => {
      console.log(`Record #${index + 1}:`);
      console.log(`  ID: ${staff.id}`);
      console.log(`  MemberId: ${staff.member.id} (${staff.member.email})`);
      console.log(
        `  VendorId: ${staff.vendor.id} (${staff.vendor.displayName || 'No Name'})`,
      );
      console.log(`  Title: '${staff.title}'`);
      console.log(`  Permissions Raw:`, staff.permissions);
      console.log(`  Is Self-Vendor? ${staff.member.id === staff.vendor.id}`);
      console.log(`  Is Title 'Owner'? ${staff.title === 'Owner'}`);
    });
  }

  await app.close();
}

bootstrap();
