import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vendor } from './entities/vendor.entity';
import { VendorService } from './vendor.service';
import { VendorController } from './vendor.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Vendor])],
  providers: [VendorService],
  controllers: [VendorController],
  exports: [VendorService, TypeOrmModule],
})
export class VendorModule {}