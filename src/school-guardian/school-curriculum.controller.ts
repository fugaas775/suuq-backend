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
  CreateSchoolCurriculumResourceDto,
  ListSchoolCurriculumQueryDto,
  UpdateSchoolCurriculumResourceDto,
} from './dto/school-curriculum.dto';
import { SchoolCurriculumService } from './school-curriculum.service';

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
const TEACHER_OR_OFFICE = [
  PosSchoolPermission.VIEW_CLASS_BOARD,
  PosSchoolPermission.MARK_ATTENDANCE,
  PosSchoolPermission.ENROL_STUDENT,
];

/**
 * The curriculum shelf as a school's staff read it: every live resource
 * with the teachers' links, and the grades the signed-in teacher's own
 * classes span. Pupils and families read theirs inside their portal's
 * pupil page (the dossier), never here.
 */
@ApiTags('School Curriculum')
@Controller('pos/v1/school/curriculum')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolCurriculumController {
  constructor(private readonly svc: SchoolCurriculumService) {}

  @Get()
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(...TEACHER_OR_OFFICE)
  list(
    @Query() query: ListSchoolCurriculumQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const u = (req.user ?? {}) as {
      id?: number;
      email?: string;
      roles?: string[];
    };
    return this.svc.forStaff(Number(query.branchId), {
      id: u.id ?? null,
      email: u.email ?? null,
      roles: u.roles ?? null,
    });
  }
}

/**
 * The platform's shelf — what the admins list for EVERY school on the
 * SCHOOL format. No branch: the content is the platform's, and so is the
 * door (ADMIN / SUPER_ADMIN, as the service-format panel's).
 */
@ApiTags('Admin School Curriculum')
@Controller('admin/school-curriculum')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminSchoolCurriculumController {
  constructor(private readonly svc: SchoolCurriculumService) {}

  @Get()
  list() {
    return this.svc.adminList();
  }

  @Post()
  create(
    @Body() dto: CreateSchoolCurriculumResourceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const u = (req.user ?? {}) as {
      id?: number;
      displayName?: string;
      email?: string;
    };
    return this.svc.create(dto, {
      id: u.id ?? null,
      name: u.displayName || u.email || null,
    });
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchoolCurriculumResourceDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
