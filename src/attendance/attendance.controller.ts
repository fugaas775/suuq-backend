import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RequirePosPermissions } from '../auth/decorators/require-pos-permissions.decorator';
import { SchoolClassScopeService } from '../school/school-class-scope.service';
import { SchoolTimetableService } from '../school/school-timetable.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { PosSchoolPermission } from '../school/permissions/pos-school-permission.enum';
import { AttendanceSubjectType } from './entities/attendance-mark.entity';
import {
  ListAttendanceQueryDto,
  MarkAttendanceDto,
  ReclassAttendanceDto,
  RekeyAttendanceDto,
} from './dto/attendance.dto';
import { AttendanceService } from './attendance.service';

const GUARDS = [
  JwtAuthGuard,
  RolesGuard,
  RetailModulesGuard,
  PosBranchAccessGuard,
];

/**
 * The pupils' register.
 *
 * POS_OPERATOR is granted, because the person who takes a register is a class
 * teacher and a class teacher's account is an operator's. The write gate names
 * MARK_ATTENDANCE first and ENROL_STUDENT second, and the guard ORs them: the
 * narrow new permission can be handed to a teacher on its own, while every
 * clerk already enrolling pupils can mark from the day this ships without an
 * administrator editing 22 staff accounts first.
 *
 * The STAFF register is a separate controller with a narrower role list — see
 * {@link AttendanceStaffController}. One service serves both.
 */
@ApiTags('Attendance')
@Controller('pos/v1/attendance')
@UseGuards(...GUARDS)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class AttendanceController {
  constructor(
    private readonly svc: AttendanceService,
    private readonly scope: SchoolClassScopeService,
    private readonly timetable: SchoolTimetableService,
  ) {}

  @Get('students')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.VIEW_CLASS_BOARD)
  list(@Query() query: ListAttendanceQueryDto) {
    return this.svc.list(AttendanceSubjectType.STUDENT, query);
  }

  /**
   * The signed-in person's OWN staff register, read-only — the day marks and
   * lesson marks their heads recorded. On the teacher's permissions, because
   * it is the teacher who asks; the STAFF register itself stays the heads'
   * (AttendanceStaffController). The employee row is resolved from the token,
   * so nobody can read a colleague's.
   */
  @Get('staff/mine')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.VIEW_CLASS_BOARD,
    PosSchoolPermission.MARK_ATTENDANCE,
  )
  async mine(
    @Query() query: ListAttendanceQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const mine = await this.timetable.mine(
      query.branchId,
      req?.user?.id ?? null,
    );
    const employee = mine.employee;
    const rows = await this.svc.mine(
      employee ? String(employee.id) : null,
      query,
    );
    return { employee, ...rows };
  }

  @Get('students/summary')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.VIEW_CLASS_BOARD)
  summary(@Query() query: ListAttendanceQueryDto) {
    return this.svc.summary(AttendanceSubjectType.STUDENT, query);
  }

  // Named 'students/mark' rather than a bare POST on 'students': a literal
  // segment can never be mistaken for an ':id', which is the trap the school
  // registry's 'classes/reorder' already carries a comment about.
  @Post('students/mark')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.MARK_ATTENDANCE,
    PosSchoolPermission.ENROL_STUDENT,
  )
  async mark(@Body() dto: MarkAttendanceDto, @Req() req: AuthenticatedRequest) {
    // Who is taking it, and which classes are theirs to take. A teacher is
    // held to the classes the school assigned them; the office is not.
    const scope = await this.scope.resolve(dto.branchId, req?.user);
    return this.svc.mark(
      AttendanceSubjectType.STUDENT,
      dto,
      req?.user?.id ?? null,
      {
        recordedByName: scope.recordedBy,
        scope: {
          assert: (classCode) => this.scope.assertInScope(scope, classCode),
          // And the pupils themselves: a folio in another class is a tap
          // that crossed over from another sheet, whoever is taking it.
          assertPupils: (classCode, refs) =>
            this.scope.assertPupilsInClass(dto.branchId, classCode, refs),
        },
      },
    );
  }

  /**
   * Only ever called by the class RENAME in Seller HQ, alongside the folio
   * re-tag it already performs. Gated on ENROL_STUDENT, not MARK_ATTENDANCE:
   * this rewrites a whole class's history and belongs with whoever may define
   * the classes, not with whoever may mark them.
   */
  //
  // A login held to its classes (the Teacher lane, which may carry
  // ENROL_STUDENT beside it) moves a register only between two classes that
  // are both its own: otherwise "rename 4aad to 3aad" is a way to write into
  // — or empty out — another teacher's register. The office is not scoped.
  @Patch('students/reclass')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  async reclass(
    @Body() dto: ReclassAttendanceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const scope = await this.scope.resolve(dto.branchId, req?.user);
    if (scope.scoped) {
      this.scope.assertInScope(scope, dto.from);
      this.scope.assertInScope(scope, dto.to);
    }
    return this.svc.reclass(dto);
  }

  /**
   * Re-file a pupil's marks from a duplicate folio onto the surviving one.
   * Same door as reclass: it is a fact about the roll, not about marking —
   * and it names no class at all, so there is nothing to hold a teacher to.
   * The office's alone: a class-scoped login is refused outright.
   */
  @Patch('students/rekey')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  async rekey(
    @Body() dto: RekeyAttendanceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const scope = await this.scope.resolve(dto.branchId, req?.user);
    if (scope.scoped) {
      throw new ForbiddenException({
        code: 'SCHOOL_OFFICE_ONLY',
        message:
          "Moving a pupil's register between records is the school office's — ask the office to merge the duplicate.",
      });
    }
    return this.svc.rekey(dto);
  }
}
