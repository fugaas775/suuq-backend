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
  ListSchoolStaffNoticesQueryDto,
  ReadSchoolStaffNoticeDto,
  SendSchoolStaffNoticeDto,
  SetSchoolStaffNoticeActiveDto,
} from './dto/school-staff-notice.dto';
import { SchoolStaffNoticeService } from './school-staff-notice.service';

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
/* The teacher's own permissions, as warnings and leave: the person reads
   what reaches them. The SERVICE decides who writes. */
const TEACHER_PERMISSIONS = [
  PosSchoolPermission.VIEW_CLASS_BOARD,
  PosSchoolPermission.MARK_ATTENDANCE,
];

/** Messages from the heads to the staff — one person, several, or everyone. */
@ApiTags('School Staff Notices')
@Controller('pos/v1/school/staff-notices')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolStaffNoticeController {
  constructor(private readonly svc: SchoolStaffNoticeService) {}

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
    @Query() query: ListSchoolStaffNoticesQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.list(query, this.actor(req));
  }

  @Post()
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_PERMISSIONS)
  send(
    @Body() dto: SendSchoolStaffNoticeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.send(dto, this.actor(req));
  }

  @Patch(':id/active')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_PERMISSIONS)
  setActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetSchoolStaffNoticeActiveDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.setActive(id, dto, this.actor(req));
  }

  @Patch(':id/read')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_PERMISSIONS)
  read(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReadSchoolStaffNoticeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.markRead(id, dto, this.actor(req));
  }
}
