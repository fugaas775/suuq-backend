import {
  Body,
  Controller,
  Delete,
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
import { PosSchoolPermission } from '../school/permissions/pos-school-permission.enum';
import {
  CreateSchoolGuardianDto,
  CreateSchoolNoticeDto,
  ListSchoolGuardiansQueryDto,
  ListSchoolNoticesQueryDto,
  ResetSchoolGuardianPasswordDto,
  SetSchoolPupilPhonesDto,
  UpdateSchoolGuardianDto,
  UpdateSchoolNoticeDto,
} from './dto/school-guardian.dto';
import { SchoolGuardianService } from './school-guardian.service';
import { SchoolLoginScopeService } from './school-login-scope';

/**
 * Who may open the two login desks: the office (ENROL_STUDENT), the cashier
 * (MANAGE_SCHOOL_LOGINS) — the whole school — and a teacher
 * (MANAGE_CLASS_LOGINS), held to their own classes by SchoolLoginScopeService.
 */
export const LOGIN_DESK_PERMISSIONS = [
  PosSchoolPermission.ENROL_STUDENT,
  PosSchoolPermission.MANAGE_SCHOOL_LOGINS,
  PosSchoolPermission.MANAGE_CLASS_LOGINS,
];

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
 * The office's desk for parents' logins. Everything sits on ENROL_STUDENT —
 * the right that puts a child on the roll is the right that hands the
 * family a login to read it. MANAGE_SCHOOL_LOGINS opens it too — the
 * cashier's, who hands out logins but may not edit the roll (owner
 * 2026-10-18). A teacher's lane (VIEW_CLASS_BOARD) does not pass. Notices,
 * below, stay ENROL_STUDENT alone.
 */
@ApiTags('School Guardians')
@Controller('pos/v1/school/guardians')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolGuardianController {
  constructor(
    private readonly svc: SchoolGuardianService,
    private readonly loginScope: SchoolLoginScopeService,
  ) {}

  private actor(req: AuthenticatedRequest) {
    const u = (req.user ?? {}) as {
      id?: number;
      email?: string;
      roles?: string[];
    };
    return { id: u.id ?? null, email: u.email ?? null, roles: u.roles ?? [] };
  }

  /** The whole school's families (null), or a teacher's own classes'. */
  private scope(branchId: number, req: AuthenticatedRequest) {
    return this.loginScope.resolve(Number(branchId), this.actor(req));
  }

  @Get()
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...LOGIN_DESK_PERMISSIONS)
  async list(
    @Query() query: ListSchoolGuardiansQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.list(query.branchId, await this.scope(query.branchId, req));
  }

  /** Families on the roll with no login yet, grouped by the guardian's phone. */
  @Get('suggestions')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...LOGIN_DESK_PERMISSIONS)
  async suggestions(
    @Query() query: ListSchoolGuardiansQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.suggestions(
      query.branchId,
      await this.scope(query.branchId, req),
    );
  }

  @Post()
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...LOGIN_DESK_PERMISSIONS)
  async create(
    @Body() dto: CreateSchoolGuardianDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.create(
      dto,
      this.actor(req),
      await this.scope(dto.branchId, req),
    );
  }

  /**
   * The parents' phone onto the children's own records — the guardian phone
   * and nothing else of a pupil's folio (see SchoolGuardianService.setPupilPhones).
   * Declared before ':id' so the path is not read as an id.
   */
  @Post('pupil-phones')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...LOGIN_DESK_PERMISSIONS)
  async setPupilPhones(
    @Body() dto: SetSchoolPupilPhonesDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.setPupilPhones(dto, await this.scope(dto.branchId, req));
  }

  @Patch(':id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...LOGIN_DESK_PERMISSIONS)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchoolGuardianDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.update(id, dto, await this.scope(dto.branchId, req));
  }

  @Post(':id/password')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...LOGIN_DESK_PERMISSIONS)
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetSchoolGuardianPasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.resetPassword(id, dto, await this.scope(dto.branchId, req));
  }

  @Delete(':id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...LOGIN_DESK_PERMISSIONS)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.remove(id, branchId, await this.scope(branchId, req));
  }
}

/**
 * Notices from the office to the families — the other half of the same
 * desk, on the same right (ENROL_STUDENT). A parent reads them through
 * `guardian-portal/me`, filtered to the whole school's and their own
 * children's classes'.
 */
@ApiTags('School Notices')
@Controller('pos/v1/school/notices')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolNoticeController {
  constructor(private readonly svc: SchoolGuardianService) {}

  private actor(req: AuthenticatedRequest) {
    const u = (req.user ?? {}) as {
      id?: number;
      email?: string;
      roles?: string[];
    };
    return { id: u.id ?? null, email: u.email ?? null, roles: u.roles ?? [] };
  }

  @Get()
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  list(@Query() query: ListSchoolNoticesQueryDto) {
    return this.svc.listNotices(query.branchId);
  }

  @Post()
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  create(@Body() dto: CreateSchoolNoticeDto, @Req() req: AuthenticatedRequest) {
    return this.svc.createNotice(dto, this.actor(req));
  }

  @Patch(':id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchoolNoticeDto,
  ) {
    return this.svc.updateNotice(id, dto);
  }

  @Delete(':id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.svc.removeNotice(id, branchId);
  }
}
