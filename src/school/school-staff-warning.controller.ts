import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RequirePosPermissions } from '../auth/decorators/require-pos-permissions.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { PosSchoolPermission } from './permissions/pos-school-permission.enum';
import {
  AcknowledgeSchoolStaffWarningDto,
  IssueSchoolStaffWarningDto,
  ListSchoolStaffWarningsQueryDto,
  SchoolStaffWarningSummaryQueryDto,
  WithdrawSchoolStaffWarningDto,
} from './dto/school-staff-warning.dto';
import { SchoolStaffWarningService } from './school-staff-warning.service';

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
/* The teacher's own permissions, as leave and lesson plans: the person
   reads and acknowledges their own. The SERVICE decides who issues. */
const TEACHER_PERMISSIONS = [
  PosSchoolPermission.VIEW_CLASS_BOARD,
  PosSchoolPermission.MARK_ATTENDANCE,
];

/** Staff warnings — verbal, written, final — the steps before a dismissal. */
@ApiTags('School Staff Warnings')
@Controller('pos/v1/school/warnings')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolStaffWarningController {
  constructor(private readonly svc: SchoolStaffWarningService) {}

  private actor(req: AuthenticatedRequest) {
    const u = (req.user ?? {}) as {
      id?: number;
      email?: string;
      roles?: string[];
    };
    return { id: u.id ?? null, email: u.email ?? null, roles: u.roles ?? null };
  }

  @Get()
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...TEACHER_PERMISSIONS)
  list(
    @Query() query: ListSchoolStaffWarningsQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.list(query, this.actor(req));
  }

  @Get('summary')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...TEACHER_PERMISSIONS)
  summary(
    @Query() query: SchoolStaffWarningSummaryQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.summary(query.branchId, this.actor(req));
  }

  @Post()
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_PERMISSIONS)
  issue(
    @Body() dto: IssueSchoolStaffWarningDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.issue(dto, this.actor(req));
  }

  @Patch(':id/withdraw')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_PERMISSIONS)
  withdraw(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: WithdrawSchoolStaffWarningDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.withdraw(id, dto, this.actor(req));
  }

  @Patch(':id/acknowledge')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_PERMISSIONS)
  acknowledge(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcknowledgeSchoolStaffWarningDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.acknowledge(id, dto, this.actor(req));
  }
}
