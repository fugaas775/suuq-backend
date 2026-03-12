import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { User } from '../users/entities/user.entity';
import { BranchStaffController } from './branch-staff.controller';
import { BranchStaffService } from './branch-staff.service';
import { BranchStaffAssignment } from './entities/branch-staff-assignment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BranchStaffAssignment, Branch, User])],
  controllers: [BranchStaffController],
  providers: [BranchStaffService],
  exports: [BranchStaffService],
})
export class BranchStaffModule {}
