import {
  BadRequestException,
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
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { BranchesService } from '../branches/branches.service';
import { ExtendBranchSubscriptionDto } from '../branches/dto/extend-branch-subscription.dto';
import {
  BRANCH_ACTIVITY_FILTERS,
  BRANCH_SALES_SORTS,
  BranchActivityFilter,
  BranchSalesService,
  BranchSalesSort,
} from '../branches/branch-sales.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiTags('Admin — Suuq POS')
@Controller('admin/branches')
export class BranchesAdminController {
  constructor(
    private readonly branchesService: BranchesService,
    private readonly auditService: AuditService,
    private readonly branchSalesService: BranchSalesService,
  ) {}

  /**
   * GET /api/admin/branches
   *
   * Lists all POS branches across all retail tenants.
   * Intended for Super_Admin oversight of pos.suuq-s.com.
   *
   * Query params:
   *   search        — partial match on branch name (case-insensitive)
   *   serviceFormat — filter by service format (RETAIL, QSR, FSR, HOTEL, etc.)
   *   isActive      — true | false
   *   activity      — SOLD_TODAY | SOLD_THIS_MONTH | SILENT_7_DAYS | NEVER_SOLD
   *   sort          — today | month | lastSale (default: newest branch first)
   *   order         — asc | desc (default desc)
   *   page          — 1-based page number (default 1)
   *   limit         — items per page (default 25, max 100)
   */
  @Get()
  @ApiOperation({ summary: 'List all POS branches (admin overview)' })
  @ApiOkResponse({
    description: 'Paginated branch list with retailTenant and owner',
  })
  async listBranches(
    @Query('search') search?: string,
    @Query('serviceFormat') serviceFormat?: string,
    @Query('isActive') isActive?: string,
    @Query('activity') activityRaw?: string,
    @Query('sort') sortRaw?: string,
    @Query('order') orderRaw?: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1;
    const limit = limitRaw
      ? Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 25))
      : 25;
    const isActiveParsed =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;

    return this.branchesService.adminListBranches({
      search,
      serviceFormat,
      isActive: isActiveParsed,
      // Anything unrecognised is ignored rather than refused, so an old link
      // still opens the list.
      activity: BRANCH_ACTIVITY_FILTERS.includes(
        activityRaw as BranchActivityFilter,
      )
        ? (activityRaw as BranchActivityFilter)
        : undefined,
      sort: BRANCH_SALES_SORTS.includes(sortRaw as BranchSalesSort)
        ? (sortRaw as BranchSalesSort)
        : undefined,
      order: String(orderRaw || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC',
      page,
      limit,
    });
  }

  /**
   * GET /api/admin/branches/trading
   *
   * The platform's trading for the admin overview: receipted today and this
   * month against the period before, 30 days day by day, today's busiest
   * branches, and the paying or trial branches that have gone quiet or never
   * sold. Read-only.
   */
  @Get('trading')
  @ApiOperation({ summary: 'Platform trading overview (admin)' })
  async trading() {
    return this.branchesService.adminTradingOverview();
  }

  /**
   * GET /api/admin/branches/:id/sales
   *
   * What the branch has receipted: today, yesterday, this month against last,
   * a 30-day daily strip, this month's payment methods, first and last sale.
   * Days and months follow the Addis Ababa calendar. Read-only.
   */
  @Get(':id/sales')
  @ApiOperation({ summary: 'Sales activity for one branch (admin)' })
  async branchSales(@Param('id', ParseIntPipe) id: number) {
    return this.branchSalesService.detailFor(id);
  }

  /**
   * PATCH /api/admin/branches/:id
   *
   * Partially updates a branch. Currently supports toggling isActive.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Patch a branch (admin)' })
  async patchBranch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { isActive?: boolean },
  ) {
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
      throw new BadRequestException('isActive must be a boolean');
    }
    return this.branchesService.patchAdminBranch(id, body);
  }

  /**
   * POST /api/admin/branches/:id/subscription/extend
   *
   * Records a further paid term for the branch by hand — money taken outside
   * Ebirr, or goodwill. Writes a new branch-scoped subscription row chained
   * from the current period's end (see BranchesService) and an audit entry
   * carrying the admin's reason. The branch is served from the new term at
   * once; nothing is charged and no equity payouts are generated.
   */
  @Post(':id/subscription/extend')
  @ApiOperation({ summary: 'Extend a branch subscription by N months (admin)' })
  async extendSubscription(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendBranchSubscriptionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const actor = {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    };
    const result = await this.branchesService.extendAdminBranchSubscription(
      id,
      dto,
      actor,
    );
    await this.auditService.log({
      action: 'branch.subscription.extend',
      targetType: 'branch',
      targetId: id,
      actorId: actor.id,
      actorEmail: actor.email,
      reason: dto.reason,
      meta: {
        branchName: result.branch.name,
        retailTenantId: result.branch.retailTenantId,
        months: dto.months,
        planCode: result.subscription.planCode,
        subscriptionId: result.subscription.id,
        startsAt: result.subscription.startsAt,
        endsAt: result.subscription.endsAt,
        amountTotal: result.amountTotal,
        monthlyRate: result.monthlyRate,
        currency: result.subscription.currency,
        chainsFromPreviousEnd: result.chainsFromPreviousEnd,
        previousSubscriptionId: result.previous?.id ?? null,
        previousPlanCode: result.previous?.planCode ?? null,
        previousEndsAt: result.previous?.endsAt ?? null,
      },
    });
    return result;
  }

  /**
   * DELETE /api/admin/branches/bulk
   * Bulk delete branches by id array in request body.
   * Must be declared before :id route.
   */
  @Delete('bulk')
  @ApiOperation({ summary: 'Bulk delete branches (admin)' })
  async bulkDeleteBranches(
    @Body() body: { ids: number[]; settleOutstanding?: boolean },
  ) {
    if (!Array.isArray(body?.ids) || !body.ids.length) {
      throw new BadRequestException('ids must be a non-empty array');
    }
    const deleted = await this.branchesService.bulkDeleteAdminBranches(
      body.ids,
      { settleOutstanding: body.settleOutstanding === true },
    );
    return { deleted };
  }

  /**
   * DELETE /api/admin/branches/:id
   *
   * `settleOutstanding=true` first manually settles any OUTSTANDING equity BNPL
   * activations pinned to the branch, then deletes it. Without the flag, a branch
   * with outstanding obligations is rejected with a clear error.
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a branch (admin)' })
  async deleteBranch(
    @Param('id', ParseIntPipe) id: number,
    @Query('settleOutstanding') settleOutstanding?: string,
  ) {
    await this.branchesService.deleteAdminBranch(id, {
      settleOutstanding: settleOutstanding === 'true',
    });
    return { message: `Branch #${id} deleted.` };
  }
}
