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
  ListSchoolGuardiansQueryDto,
  ResetSchoolGuardianPasswordDto,
  UpdateSchoolGuardianDto,
} from './dto/school-guardian.dto';
import { SchoolGuardianService } from './school-guardian.service';

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
 * family a login to read it. A teacher's lane (VIEW_CLASS_BOARD) does not
 * pass: usernames are the office's, and so are password resets.
 */
@ApiTags('School Guardians')
@Controller('pos/v1/school/guardians')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolGuardianController {
  constructor(private readonly svc: SchoolGuardianService) {}

  private actor(req: AuthenticatedRequest) {
    const u = (req.user ?? {}) as { id?: number; email?: string; roles?: string[] };
    return { id: u.id ?? null, email: u.email ?? null, roles: u.roles ?? [] };
  }

  @Get()
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  list(@Query() query: ListSchoolGuardiansQueryDto) {
    return this.svc.list(query.branchId);
  }

  /** Families on the roll with no login yet, grouped by the guardian's phone. */
  @Get('suggestions')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  suggestions(@Query() query: ListSchoolGuardiansQueryDto) {
    return this.svc.suggestions(query.branchId);
  }

  @Post()
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  create(@Body() dto: CreateSchoolGuardianDto, @Req() req: AuthenticatedRequest) {
    return this.svc.create(dto, this.actor(req));
  }

  @Patch(':id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchoolGuardianDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Post(':id/password')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetSchoolGuardianPasswordDto,
  ) {
    return this.svc.resetPassword(id, dto);
  }

  @Delete(':id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.svc.remove(id, branchId);
  }
}
