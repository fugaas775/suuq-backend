import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendanceModule } from '../attendance/attendance.module';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Branch } from '../branches/entities/branch.entity';
import { BranchEmployee } from '../payroll/entities/branch-employee.entity';
import { PosCheckout } from '../pos-sync/entities/pos-checkout.entity';
import { PosSuspendedCart } from '../pos-sync/entities/pos-suspended-cart.entity';
import { RetailModule } from '../retail/retail.module';
import { SchoolClass } from '../school/entities/school-class.entity';
import { SchoolTextbookLoan } from '../school/entities/school-textbook-loan.entity';
import { SchoolModule } from '../school/school.module';
import { User } from '../users/entities/user.entity';
import { SchoolGuardianPupil } from './entities/school-guardian-pupil.entity';
import { SchoolGuardian } from './entities/school-guardian.entity';
import { SchoolNotice } from './entities/school-notice.entity';
import { SchoolHomework } from './entities/school-homework.entity';
import { SchoolMessageThread } from './entities/school-message-thread.entity';
import { SchoolMessage } from './entities/school-message.entity';
import { SchoolHomeworkController } from './school-homework.controller';
import { SchoolHomeworkService } from './school-homework.service';
import { SchoolMessageController } from './school-message.controller';
import { SchoolMessageService } from './school-message.service';
import { SchoolStaffReachService } from './school-staff-reach.service';
import { SchoolGuardianPortalController } from './school-guardian-portal.controller';
import {
  SchoolGuardianController,
  SchoolNoticeController,
} from './school-guardian.controller';
import { SchoolGuardianService } from './school-guardian.service';

/**
 * Parents' logins for the SCHOOL format.
 *
 * Its own module rather than a corner of SchoolModule because the parent's
 * page reads the day register (AttendanceModule, which itself imports
 * SchoolModule) — folding this into SchoolModule would make that import a
 * cycle. AuthModule is global, so the sign-in service needs no import.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SchoolGuardian,
      SchoolGuardianPupil,
      SchoolNotice,
      // The teachers' side: homework for a class, messages with a family.
      SchoolHomework,
      SchoolMessageThread,
      SchoolMessage,
      // Read-only: the pupils' records, the receipts settled against them,
      // the class registry (for the class teacher), the books out.
      PosSuspendedCart,
      PosCheckout,
      Branch,
      User,
      SchoolClass,
      BranchEmployee,
      SchoolTextbookLoan,
    ]),
    RetailModule,
    SchoolModule,
    AttendanceModule,
  ],
  controllers: [
    SchoolGuardianController,
    SchoolNoticeController,
    SchoolHomeworkController,
    SchoolMessageController,
    SchoolGuardianPortalController,
  ],
  providers: [
    SchoolGuardianService,
    SchoolStaffReachService,
    SchoolHomeworkService,
    SchoolMessageService,
    PosBranchAccessGuard,
    RolesGuard,
  ],
  exports: [SchoolGuardianService, SchoolHomeworkService, SchoolMessageService],
})
export class SchoolGuardianModule {}
