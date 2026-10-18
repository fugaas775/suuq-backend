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
  constructor(private readonly svc: SchoolStudentAccountService) {}

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
  @RequirePosPermissions(
    PosSchoolPermission.ENROL_STUDENT,
    PosSchoolPermission.MANAGE_SCHOOL_LOGINS,
  )
  list(@Query() query: ListSchoolStudentAccountsQueryDto) {
    return this.svc.list(query.branchId);
  }

  /** Pupils on the roll with no login yet, each with a suggested username. */
  @Get('suggestions')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.ENROL_STUDENT,
    PosSchoolPermission.MANAGE_SCHOOL_LOGINS,
  )
  suggestions(@Query() query: ListSchoolStudentAccountsQueryDto) {
    return this.svc.suggestions(query.branchId);
  }

  @Post()
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.ENROL_STUDENT,
    PosSchoolPermission.MANAGE_SCHOOL_LOGINS,
  )
  create(
    @Body() dto: CreateSchoolStudentAccountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.create(dto, this.actor(req));
  }

  /** Logins for a class or the whole roll in one call; passwords come back once. */
  @Post('bulk')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.ENROL_STUDENT,
    PosSchoolPermission.MANAGE_SCHOOL_LOGINS,
  )
  createMany(
    @Body() dto: CreateSchoolStudentAccountsBulkDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.createMany(dto, this.actor(req));
  }

  @Patch(':id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.ENROL_STUDENT,
    PosSchoolPermission.MANAGE_SCHOOL_LOGINS,
  )
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchoolStudentAccountDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Post(':id/password')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.ENROL_STUDENT,
    PosSchoolPermission.MANAGE_SCHOOL_LOGINS,
  )
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetSchoolStudentAccountPasswordDto,
  ) {
    return this.svc.resetPassword(id, dto);
  }

  @Delete(':id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.ENROL_STUDENT,
    PosSchoolPermission.MANAGE_SCHOOL_LOGINS,
  )
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.svc.remove(id, branchId);
  }
}
