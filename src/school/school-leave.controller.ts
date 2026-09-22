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
  CancelSchoolLeaveDto,
  CreateSchoolLeaveDto,
  DecideSchoolLeaveDto,
  ListSchoolLeaveQueryDto,
  SchoolLeaveSummaryQueryDto,
} from './dto/school-leave.dto';
import { SchoolLeaveService } from './school-leave.service';

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
/* The teacher's own permissions, as lesson plans: it is the teacher who
   asks. The SERVICE decides who reads everyone's and who decides. */
const TEACHER_PERMISSIONS = [
  PosSchoolPermission.VIEW_CLASS_BOARD,
  PosSchoolPermission.MARK_ATTENDANCE,
];

/**
 * Staff leave. Every route sits on the teacher's own permissions and the
 * service decides: a person their own requests, the heads everyone's and
 * the decision.
 */
@ApiTags('School Leave')
@Controller('pos/v1/school/leave')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolLeaveController {
  constructor(private readonly svc: SchoolLeaveService) {}

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
    @Query() query: ListSchoolLeaveQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.list(query, this.actor(req));
  }

  @Get('summary')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...TEACHER_PERMISSIONS)
  summary(
    @Query() query: SchoolLeaveSummaryQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.summary(
      query.branchId,
      query.from,
      query.to,
      this.actor(req),
    );
  }

  @Post()
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_PERMISSIONS)
  create(@Body() dto: CreateSchoolLeaveDto, @Req() req: AuthenticatedRequest) {
    return this.svc.create(dto, this.actor(req));
  }

  @Patch(':id/decide')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_PERMISSIONS)
  decide(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideSchoolLeaveDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.decide(id, dto, this.actor(req));
  }

  @Patch(':id/cancel')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_PERMISSIONS)
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelSchoolLeaveDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.cancel(id, dto, this.actor(req));
  }
}
