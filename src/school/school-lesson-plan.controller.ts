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
  ListSchoolLessonPlansQueryDto,
  ReviewSchoolLessonPlanDto,
  SaveSchoolLessonPlanDto,
  SchoolLessonPlanSummaryQueryDto,
  SetSchoolLessonPlanStatusDto,
} from './dto/school-lesson-plan.dto';
import { SchoolLessonPlanService } from './school-lesson-plan.service';

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
 * Lesson plans. Every route sits on the teacher's own permissions — it is
 * the teacher who writes and asks — and the SERVICE decides who may do what:
 * a teacher their own lessons, the office everyone's, sign-off the office's.
 */
@ApiTags('School Lesson Plans')
@Controller('pos/v1/school/lesson-plans')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolLessonPlanController {
  constructor(private readonly svc: SchoolLessonPlanService) {}

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
  @RequirePosPermissions(
    PosSchoolPermission.VIEW_CLASS_BOARD,
    PosSchoolPermission.MARK_ATTENDANCE,
  )
  list(
    @Query() query: ListSchoolLessonPlansQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.list(query, this.actor(req));
  }

  @Get('summary')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.VIEW_CLASS_BOARD,
    PosSchoolPermission.MARK_ATTENDANCE,
  )
  summary(
    @Query() query: SchoolLessonPlanSummaryQueryDto,
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
  @RequirePosPermissions(
    PosSchoolPermission.MARK_ATTENDANCE,
    PosSchoolPermission.VIEW_CLASS_BOARD,
  )
  save(@Body() dto: SaveSchoolLessonPlanDto, @Req() req: AuthenticatedRequest) {
    return this.svc.upsert(dto, this.actor(req));
  }

  @Patch(':id/status')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.MARK_ATTENDANCE,
    PosSchoolPermission.VIEW_CLASS_BOARD,
  )
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetSchoolLessonPlanStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.setStatus(id, dto, this.actor(req));
  }

  @Patch(':id/review')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.ENROL_STUDENT,
    PosSchoolPermission.VIEW_CLASS_BOARD,
  )
  review(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewSchoolLessonPlanDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.review(id, dto, this.actor(req));
  }
}
