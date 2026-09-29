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
  CreateSchoolHomeworkDto,
  ListSchoolHomeworkQueryDto,
  UpdateSchoolHomeworkDto,
} from './dto/school-homework.dto';
import { SchoolHomeworkService } from './school-homework.service';

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
// A teacher's lane holds the class board and the register; the office holds
// ENROL_STUDENT. Any of the three opens the door; the SERVICE decides which
// classes the person reaches.
const TEACHER_OR_OFFICE = [
  PosSchoolPermission.VIEW_CLASS_BOARD,
  PosSchoolPermission.MARK_ATTENDANCE,
  PosSchoolPermission.ENROL_STUDENT,
];

/**
 * Homework — set by a teacher for a class, read by its families on the
 * parents' portal. The teacher reaches the classes on their timetable and
 * the ones the office assigned; the heads reach every class.
 */
@ApiTags('School Homework')
@Controller('pos/v1/school/homework')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolHomeworkController {
  constructor(private readonly svc: SchoolHomeworkService) {}

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
  @RequirePosPermissions(...TEACHER_OR_OFFICE)
  list(
    @Query() query: ListSchoolHomeworkQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.list(query, this.actor(req));
  }

  @Post()
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_OR_OFFICE)
  create(
    @Body() dto: CreateSchoolHomeworkDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.create(dto, this.actor(req));
  }

  @Patch(':id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(...TEACHER_OR_OFFICE)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchoolHomeworkDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.update(id, dto, this.actor(req));
  }

  @Delete(':id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...TEACHER_OR_OFFICE)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.remove(id, branchId, this.actor(req));
  }
}
