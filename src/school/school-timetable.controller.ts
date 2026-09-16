import {
  Body,
  Controller,
  Get,
  Put,
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
import { PosSchoolPermission } from './permissions/pos-school-permission.enum';
import {
  GetSchoolTimetableQueryDto,
  PutSchoolTimetableDto,
} from './dto/school-timetable.dto';
import { SchoolTimetableService } from './school-timetable.service';

const GUARDS = [
  JwtAuthGuard,
  RolesGuard,
  RetailModulesGuard,
  PosBranchAccessGuard,
];
const ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
];

/**
 * The weekly period schedule, beside the class registry it is built on.
 *
 * Read by anyone who can see the board OR take a register — a teacher's lane
 * holds MARK_ATTENDANCE and needs their own week; the guard ORs the two, as it
 * does on AttendanceController. Written on ENROL_STUDENT, the same setup
 * permission the registry's own writes use, for the same reason: no new
 * permission for a distinction no school has asked to draw.
 */
@ApiTags('School Timetable')
@Controller('pos/v1/school')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolTimetableController {
  constructor(private readonly svc: SchoolTimetableService) {}

  @Get('timetable')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.VIEW_CLASS_BOARD,
    PosSchoolPermission.MARK_ATTENDANCE,
  )
  get(@Query() query: GetSchoolTimetableQueryDto) {
    return this.svc.get(query.branchId);
  }

  @Put('timetable')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  put(@Body() dto: PutSchoolTimetableDto, @Req() req: AuthenticatedRequest) {
    const userId = Number((req.user as { id?: number })?.id) || null;
    return this.svc.put(dto, userId);
  }
}
