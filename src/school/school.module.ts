import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetailModule } from '../retail/retail.module';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PosSuspendedCart } from '../pos-sync/entities/pos-suspended-cart.entity';
import { BranchEmployee } from '../payroll/entities/branch-employee.entity';
import { Branch } from '../branches/entities/branch.entity';
import { BranchStaffAssignment } from '../branch-staff/entities/branch-staff-assignment.entity';
import { SchoolClass } from './entities/school-class.entity';
import { SchoolTimetable } from './entities/school-timetable.entity';
import { SchoolTextbookLoan } from './entities/school-textbook-loan.entity';
import { SchoolTextbookTitle } from './entities/school-textbook-title.entity';
import { SchoolClassController } from './school-class.controller';
import { SchoolClassService } from './school-class.service';
import { SchoolMarksController } from './school-marks.controller';
import { SchoolMarksService } from './school-marks.service';
import { SchoolTextbookController } from './school-textbook.controller';
import { SchoolTextbookService } from './school-textbook.service';
import { SchoolTimetableController } from './school-timetable.controller';
import { SchoolTimetableService } from './school-timetable.service';
import { SchoolClassScopeService } from './school-class-scope.service';
import { SchoolLessonPlan } from './entities/school-lesson-plan.entity';
import { SchoolRoom } from './entities/school-room.entity';
import { SchoolRoomService } from './school-room.service';
import { SchoolRoomController } from './school-room.controller';
import { SchoolLessonPlanService } from './school-lesson-plan.service';
import { SchoolLessonPlanController } from './school-lesson-plan.controller';

/**
 * SCHOOL — a term-based POS format whose board unit is a CLASS: a container
 * holding one open folio per enrolled student, concurrently, all term.
 *
 * Owns its own registry under `pos/v1/school/*`, independent of the night-based
 * HOTEL and month-based PROPERTY_RENTAL modules, exactly as those two are
 * independent of each other. Fees are NOT owned here — they stay on products,
 * because the checkout re-prices every line from the product it names; a class
 * only points at the product that prices it.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SchoolClass,
      SchoolTimetable,
      // Read-only: refusing to delete a class that still holds children means
      // counting the student folios sitting in it.
      PosSuspendedCart,
      // Read-only: a timetable slot names a teacher by their employment row,
      // and an id that is not on this branch's register is refused.
      BranchEmployee,
      // Textbooks: the titles a class carries and who holds which.
      SchoolTextbookTitle,
      SchoolTextbookLoan,
      // Lesson plans: what a teacher means to teach, and what became of it.
      SchoolLessonPlan,
      // Rooms and their desks — the seats a class can take.
      SchoolRoom,
      // Marks: the policy reads the branch's owner and the caller's
      // assignment (its ENTER_MARKS capability), as withdrawal does.
      Branch,
      BranchStaffAssignment,
    ]),
    RetailModule,
  ],
  controllers: [
    SchoolClassController,
    SchoolTimetableController,
    SchoolTextbookController,
    SchoolLessonPlanController,
    SchoolRoomController,
    SchoolMarksController,
  ],
  providers: [
    SchoolClassService,
    SchoolTimetableService,
    SchoolClassScopeService,
    SchoolLessonPlanService,
    SchoolRoomService,
    SchoolTextbookService,
    SchoolMarksService,
    PosBranchAccessGuard,
    RolesGuard,
  ],
  exports: [
    SchoolClassService,
    SchoolTimetableService,
    SchoolClassScopeService,
  ],
})
export class SchoolModule {}
