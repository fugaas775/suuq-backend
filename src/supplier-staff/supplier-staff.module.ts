import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplierProfile } from '../suppliers/entities/supplier-profile.entity';
import { User } from '../users/entities/user.entity';
import { SupplierStaffAssignment } from './entities/supplier-staff-assignment.entity';
import { SupplierStaffController } from './supplier-staff.controller';
import { SupplierStaffService } from './supplier-staff.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupplierStaffAssignment, SupplierProfile, User]),
  ],
  controllers: [SupplierStaffController],
  providers: [SupplierStaffService],
  exports: [SupplierStaffService],
})
export class SupplierStaffModule {}
