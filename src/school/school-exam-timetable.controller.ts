import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RequirePosPermissions } from '../auth/decorators/require-pos-permissions.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { PosSchoolPermission } from './permissions/pos-school-permission.enum';
import {
  ListSchoolExamTimetablesQueryDto,
  SaveSchoolExamTimetableDto,
} from './dto/school-exam-timetable.dto';
import { SchoolExamTimetableService } from './school-exam-timetable.service';

/**
 * Exam timetables, beside the weekly one — read by whoever reads the week
 * (the board, or a teacher's register), written on ENROL_STUDENT like every
 * other piece of the school's setup.
 */
@ApiTags('School Exam Timetables')
@Controller('pos/v1/school/exam-timetables')
@UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolExamTimetableController {
  constructor(private readonly svc: SchoolExamTimetableService) {}

  @Get()
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.VIEW_CLASS_BOARD,
    PosSchoolPermission.MARK_ATTENDANCE,
  )
  list(@Query() query: ListSchoolExamTimetablesQueryDto) {
    return this.svc.list(query.branchId);
  }

  @Post()
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  create(
    @Body() dto: SaveSchoolExamTimetableDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.create(
      dto,
      Number((req.user as { id?: number })?.id) || null,
    );
  }

  @Put(':id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveSchoolExamTimetableDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.update(
      id,
      dto,
      Number((req.user as { id?: number })?.id) || null,
    );
  }

  @Delete(':id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.ENROL_STUDENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListSchoolExamTimetablesQueryDto,
  ) {
    return this.svc.remove(id, query.branchId);
  }
}
