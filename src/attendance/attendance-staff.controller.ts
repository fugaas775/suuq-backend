import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { AttendanceSubjectType } from './entities/attendance-mark.entity';
import {
  ListAttendanceQueryDto,
  MarkAttendanceDto,
  MarkLessonAttendanceDto,
} from './dto/attendance.dto';
import { AttendanceService } from './attendance.service';
import { SchoolClassScopeService } from '../school/school-class-scope.service';

const GUARDS = [
  JwtAuthGuard,
  RolesGuard,
  RetailModulesGuard,
  PosBranchAccessGuard,
];

/**
 * The staff register — the same table, a narrower door.
 *
 * POS_OPERATOR is deliberately absent, for exactly the reason it is absent from
 * PayrollController: who came in late is an employment record about a colleague,
 * and a cashier reading the director's is a different kind of incident from a
 * cashier voiding a sale. The scoped POS token issues POS_MANAGER to owners and
 * managers, so the role gate is the line wanted and no permission checkbox can
 * widen it.
 *
 * There is no `reclass` here: staff have no class, and the column is null on
 * every row this controller writes.
 */
@ApiTags('Attendance')
@Controller('pos/v1/attendance')
@UseGuards(...GUARDS)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class AttendanceStaffController {
  constructor(
    private readonly svc: AttendanceService,
    private readonly scope: SchoolClassScopeService,
  ) {}

  @Get('staff')
  @RetailBranchContext('query.branchId')
  list(@Query() query: ListAttendanceQueryDto) {
    return this.svc.list(AttendanceSubjectType.STAFF, query);
  }

  @Get('staff/summary')
  @RetailBranchContext('query.branchId')
  summary(@Query() query: ListAttendanceQueryDto) {
    return this.svc.summary(AttendanceSubjectType.STAFF, query);
  }

  @Post('staff/mark')
  @RetailBranchContext('body.branchId')
  async mark(@Body() dto: MarkAttendanceDto, @Req() req: AuthenticatedRequest) {
    const scope = await this.scope.resolve(dto.branchId, req?.user);
    return this.svc.mark(
      AttendanceSubjectType.STAFF,
      dto,
      req?.user?.id ?? null,
      { recordedByName: scope.recordedBy },
    );
  }

  /* ── Lessons: period by period, against the timetable ───────────────────
     The same door as the day register — POS_MANAGER only — because a lesson
     a teacher did not teach is the same kind of employment fact as a day they
     did not come in. */

  @Get('staff/lessons')
  @RetailBranchContext('query.branchId')
  listLessons(@Query() query: ListAttendanceQueryDto) {
    return this.svc.listLessons(AttendanceSubjectType.STAFF, query);
  }

  @Get('staff/lessons/summary')
  @RetailBranchContext('query.branchId')
  summaryLessons(@Query() query: ListAttendanceQueryDto) {
    return this.svc.summaryLessons(AttendanceSubjectType.STAFF, query);
  }

  @Post('staff/lessons/mark')
  @RetailBranchContext('body.branchId')
  async markLessons(
    @Body() dto: MarkLessonAttendanceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    // The recorder's name, the same way the day register stamps it: the
    // staff register's spelling, else the account.
    const scope = await this.scope.resolve(dto.branchId, req?.user);
    return this.svc.markLessons(
      AttendanceSubjectType.STAFF,
      dto,
      req?.user?.id ?? null,
      { recordedByName: scope.recordedBy },
    );
  }
}
