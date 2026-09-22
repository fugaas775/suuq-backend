import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
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
  SaveSchoolMarkReportsDto,
  SaveSchoolMarksDto,
} from './dto/school-marks.dto';
import { SchoolMarksService } from './school-marks.service';

/**
 * Marks, entered by the teacher who teaches the subject.
 *
 * The route is reachable on VIEW_CLASS_BOARD — every teacher holds it — and
 * the DECISION is the service's: the owner, or an account granted ENTER_MARKS
 * (a capability, so a manager is not on the list by rank), and for an
 * operator only the subjects their timetable puts them in front of. Writing
 * ONLY the academic record on the folio, never its money.
 */
@ApiTags('School Marks')
@Controller('pos/v1/school')
@UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolMarksController {
  constructor(private readonly svc: SchoolMarksService) {}

  @Patch('marks')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.VIEW_CLASS_BOARD)
  save(@Body() dto: SaveSchoolMarksDto, @Req() req: AuthenticatedRequest) {
    const user = req.user as { id?: number; email?: string };
    return this.svc.save(dto, {
      id: Number(user?.id) || null,
      email: user?.email ?? null,
    });
  }

  /**
   * The office's whole-report write: a hand correction of a pupil's term, a
   * marks import. The same door, and again the decision is the service's —
   * the owner, the platform's super-admin, or a manager granted ENTER_MARKS
   * (a teacher's grant enters sheets, never whole reports).
   */
  @Patch('marks/reports')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosSchoolPermission.VIEW_CLASS_BOARD)
  saveReports(
    @Body() dto: SaveSchoolMarkReportsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req.user as { id?: number; email?: string; roles?: string[] };
    return this.svc.saveReports(dto, {
      id: Number(user?.id) || null,
      email: user?.email ?? null,
      roles: Array.isArray(user?.roles) ? user.roles : [],
    });
  }
}
