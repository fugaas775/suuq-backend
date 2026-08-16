import {
  Body,
  Controller,
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
  constructor(private readonly svc: AttendanceService) {}

  @Get('students')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.VIEW_CLASS_BOARD)
  list(@Query() query: ListAttendanceQueryDto) {
    return this.svc.list(AttendanceSubjectType.STUDENT, query);
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
  mark(@Body() dto: MarkAttendanceDto, @Req() req: AuthenticatedRequest) {
    return this.svc.mark(
      AttendanceSubjectType.STUDENT,
      dto,
      req?.user?.id ?? null,
    );
  }

  /**
   * Only ever called by the class RENAME in Seller HQ, alongside the folio
   * re-tag it already performs. Gated on ENROL_STUDENT, not MARK_ATTENDANCE:
   * this rewrites a whole class's history and belongs with whoever may define
   * the classes, not with whoever may mark them.
   */
  @Patch('students/reclass')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  reclass(@Body() dto: ReclassAttendanceDto) {
    return this.svc.reclass(dto);
  }
}
