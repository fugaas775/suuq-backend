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
  CreateSchoolStudentAccountDto,
  CreateSchoolStudentAccountsBulkDto,
  ListSchoolStudentAccountsQueryDto,
  ResetSchoolStudentAccountPasswordDto,
  UpdateSchoolStudentAccountDto,
} from './dto/school-student-account.dto';
import { SchoolStudentAccountService } from './school-student-account.service';
import { SchoolLoginScopeService } from './school-login-scope';
import { LOGIN_DESK_PERMISSIONS } from './school-guardian.controller';

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
 * The office's desk for pupils' own logins. Everything sits on
 * ENROL_STUDENT, as the parents' desk does — the right that puts a child on
 * the roll is the right that hands them a login to read it — or on
 * MANAGE_SCHOOL_LOGINS, the cashier's: the logins alone, without the roll
 * (owner 2026-10-18). A teacher's lane (VIEW_CLASS_BOARD) does not pass:
 * usernames and password resets are the office's and the fee desk's.
 */
@ApiTags('School Student Accounts')
@Controller('pos/v1/school/student-accounts')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolStudentAccountController {
  constructor(
    private readonly svc: SchoolStudentAccountService,
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

  /** The whole school's pupils (null), or a teacher's own classes'. */
  private scope(branchId: number, req: AuthenticatedRequest) {
    return this.loginScope.resolve(Number(branchId), this.actor(req));
  }

  @Get()
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...LOGIN_DESK_PERMISSIONS)
  async list(
    @Query() query: ListSchoolStudentAccountsQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.list(query.branchId, await this.scope(query.branchId, req));
  }

  /** Pupils on the roll with no login yet, each with a suggested username. */
  @Get('suggestions')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...LOGIN_DESK_PERMISSIONS)
  async suggestions(
    @Query() query: ListSchoolStudentAccountsQueryDto,
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
    @Body() dto: CreateSchoolStudentAccountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.create(
      dto,
      this.actor(req),
      await this.scope(dto.branchId, req),
    );
  }

  /** Logins for a class or the whole roll in one call; passwords come back once. */
  @Post('bulk')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...LOGIN_DESK_PERMISSIONS)
  async createMany(
    @Body() dto: CreateSchoolStudentAccountsBulkDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.createMany(
      dto,
      this.actor(req),
      await this.scope(dto.branchId, req),
    );
  }

  @Patch(':id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...LOGIN_DESK_PERMISSIONS)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchoolStudentAccountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.update(id, dto, await this.scope(dto.branchId, req));
  }

  @Post(':id/password')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...LOGIN_DESK_PERMISSIONS)
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetSchoolStudentAccountPasswordDto,
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
