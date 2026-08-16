import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetailModule } from '../retail/retail.module';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AttendanceMark } from './entities/attendance-mark.entity';
import { AttendanceController } from './attendance.controller';
import { AttendanceStaffController } from './attendance-staff.controller';
import { AttendanceService } from './attendance.service';

/**
 * Attendance — who turned up, for pupils and for staff.
 *
 * Format-agnostic like PayrollModule rather than folded into SchoolModule: the
 * staff half is a hotel's housekeepers and a print shop's operators just as much
 * as it is a school's teachers, and putting it behind a SCHOOL controller would
 * make it unreachable for them. The pupils' half is the only part that knows
 * what a class is.
 *
 * Two controllers, one service, one table — the split exists solely because the
 * two registers are read by different people. See AttendanceStaffController.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AttendanceMark]), RetailModule],
  controllers: [AttendanceController, AttendanceStaffController],
  providers: [AttendanceService, PosBranchAccessGuard, RolesGuard],
  exports: [AttendanceService],
})
export class AttendanceModule {}
