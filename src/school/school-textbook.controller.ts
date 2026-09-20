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
import { PosSchoolPermission } from './permissions/pos-school-permission.enum';
import {
  CreateSchoolTextbookTitleDto,
  IssueSchoolTextbooksDto,
  ListSchoolTextbookLoansQueryDto,
  ListSchoolTextbookTitlesQueryDto,
  MarkSchoolTextbookLoanBilledDto,
  SchoolTextbooksOutstandingQueryDto,
  UpdateSchoolTextbookLoanDto,
  UpdateSchoolTextbookTitleDto,
} from './dto/school-textbook.dto';
import { SchoolTextbookService } from './school-textbook.service';

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
 * The textbook register. Read on VIEW_CLASS_BOARD; written on
 * MARK_ATTENDANCE or ENROL_STUDENT — issuing a book to a child is the
 * home-room teacher's morning, the same hand that takes the register, and
 * the office's when the teacher is away. The guard ORs the two.
 */
@ApiTags('School Textbooks')
@Controller('pos/v1/school/textbooks')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class SchoolTextbookController {
  constructor(private readonly svc: SchoolTextbookService) {}

  private actorId(req: AuthenticatedRequest): number | null {
    return Number((req.user as { id?: number })?.id) || null;
  }

  @Get('titles')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.VIEW_CLASS_BOARD)
  titles(@Query() query: ListSchoolTextbookTitlesQueryDto) {
    return this.svc.listTitles(query.branchId, query.classCode);
  }

  @Post('titles')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.MARK_ATTENDANCE,
    PosSchoolPermission.ENROL_STUDENT,
  )
  createTitle(
    @Body() dto: CreateSchoolTextbookTitleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.createTitle(dto, this.actorId(req));
  }

  @Patch('titles/:id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.MARK_ATTENDANCE,
    PosSchoolPermission.ENROL_STUDENT,
  )
  updateTitle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchoolTextbookTitleDto,
  ) {
    return this.svc.updateTitle(id, dto);
  }

  @Delete('titles/:id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.MARK_ATTENDANCE,
    PosSchoolPermission.ENROL_STUDENT,
  )
  deactivateTitle(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SchoolTextbooksOutstandingQueryDto,
  ) {
    return this.svc.deactivateTitle(id, query.branchId);
  }

  @Get('loans')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.VIEW_CLASS_BOARD)
  loans(@Query() query: ListSchoolTextbookLoansQueryDto) {
    return this.svc.listLoans(query.branchId, {
      classCode: query.classCode,
      folioId: query.folioId,
      status: query.status,
    });
  }

  @Post('loans/issue')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.MARK_ATTENDANCE,
    PosSchoolPermission.ENROL_STUDENT,
  )
  issue(
    @Body() dto: IssueSchoolTextbooksDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.issue(dto, this.actorId(req));
  }

  @Patch('loans/:id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.MARK_ATTENDANCE,
    PosSchoolPermission.ENROL_STUDENT,
  )
  updateLoan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchoolTextbookLoanDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.updateLoan(id, dto, this.actorId(req));
  }

  /**
   * The office's mark that a lost book has been billed onto the folio. The
   * money itself moved through the register's own folio write, under that
   * route's guard; this is bookkeeping in the fee desk's hands.
   */
  @Patch('loans/:id/billed')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosSchoolPermission.POST_FEE_CHARGE,
    PosSchoolPermission.SETTLE_FEE_PAYMENT,
    PosSchoolPermission.ENROL_STUDENT,
  )
  markBilled(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkSchoolTextbookLoanBilledDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.svc.markBilled(id, dto, this.actorId(req));
  }

  @Get('outstanding')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosSchoolPermission.VIEW_CLASS_BOARD)
  outstanding(@Query() query: SchoolTextbooksOutstandingQueryDto) {
    return this.svc.outstanding(query.branchId);
  }
}
