import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { ActionPathNormalizationInterceptor } from '../common/interceptors/action-path-normalization.interceptor';
import { RetailBranchContext } from './decorators/retail-branch-context.decorator';
import { RequireRetailModules } from './decorators/require-retail-modules.decorator';
import { RetailModule as RetailOsModule } from './entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from './retail-modules.guard';
import { RetailAttendanceService } from './retail-attendance.service';
import { MutateRetailHrAttendanceDto } from './dto/mutate-retail-hr-attendance.dto';
import {
  OverrideRetailHrAttendanceCheckInDto,
  OverrideRetailHrAttendanceCheckOutDto,
} from './dto/override-retail-hr-attendance.dto';
import { RetailOpsService } from './retail-ops.service';
import { RetailHrAttendanceQueryDto } from './dto/retail-hr-attendance-query.dto';
import {
  RetailHrAttendanceMutationResponseDto,
  RetailHrAttendanceResponseDto,
} from './dto/retail-hr-attendance-response.dto';
import { RetailHrAttendanceComplianceExportQueryDto } from './dto/retail-hr-attendance-compliance-export-query.dto';
import { RetailHrAttendanceComplianceSummaryResponseDto } from './dto/retail-hr-attendance-compliance-summary-response.dto';
import { RetailHrAttendanceDetailQueryDto } from './dto/retail-hr-attendance-detail-query.dto';
import { RetailHrAttendanceDetailResponseDto } from './dto/retail-hr-attendance-detail-response.dto';
import {
  RetailHrAttendanceNetworkRiskFilter,
  RetailHrAttendanceNetworkSummaryQueryDto,
} from './dto/retail-hr-attendance-network-summary-query.dto';
import { RetailHrAttendanceNetworkSummaryResponseDto } from './dto/retail-hr-attendance-network-summary-response.dto';
import {
  RetailHrAttendanceExceptionPriorityFilter,
  RetailHrAttendanceExceptionQueueFilter,
  RetailHrAttendanceExceptionsQueryDto,
} from './dto/retail-hr-attendance-exceptions-query.dto';
import { RetailHrAttendanceExceptionsResponseDto } from './dto/retail-hr-attendance-exceptions-response.dto';
import { RetailReplenishmentReviewQueryDto } from './dto/retail-replenishment-review-query.dto';
import {
  RetailReplenishmentPurchaseOrderResponseDto,
  RetailReplenishmentReevaluationResponseDto,
  RetailReplenishmentReviewResponseDto,
} from './dto/retail-replenishment-review-response.dto';
import { RetailReplenishmentNetworkSummaryQueryDto } from './dto/retail-replenishment-network-summary-query.dto';
import { RetailReplenishmentNetworkSummaryResponseDto } from './dto/retail-replenishment-network-summary-response.dto';
import {
  RetailCommandCenterAlertSeverityFilter,
  RetailCommandCenterStatusFilter,
  RetailCommandCenterSummaryQueryDto,
} from './dto/retail-command-center-summary-query.dto';
import {
  RetailCommandCenterReportSnapshotResponseDto,
  RetailCommandCenterSummaryResponseDto,
} from './dto/retail-command-center-summary-response.dto';
import { RetailPosOperationsQueryDto } from './dto/retail-pos-operations-query.dto';
import { RetailPosOperationsResponseDto } from './dto/retail-pos-operations-response.dto';
import {
  RetailPosExceptionPriorityFilter,
  RetailPosExceptionQueueFilter,
  RetailPosExceptionsQueryDto,
} from './dto/retail-pos-exceptions-query.dto';
import { RetailPosExceptionNetworkSummaryQueryDto } from './dto/retail-pos-exception-network-summary-query.dto';
import { RetailPosExceptionNetworkSummaryResponseDto } from './dto/retail-pos-exception-network-summary-response.dto';
import { RetailPosExceptionsResponseDto } from './dto/retail-pos-exceptions-response.dto';
import { RetailPosOrderDetailQueryDto } from './dto/retail-pos-order-detail-query.dto';
import { RetailPosOrderDetailResponseDto } from './dto/retail-pos-order-detail-response.dto';
import {
  RetailPosNetworkStatusFilter,
  RetailPosNetworkSummaryQueryDto,
} from './dto/retail-pos-network-summary-query.dto';
import { RetailPosNetworkSummaryResponseDto } from './dto/retail-pos-network-summary-response.dto';
import {
  RetailAccountingPriorityFilter,
  RetailAccountingOverviewQueryDto,
  RetailAccountingStateFilter,
} from './dto/retail-accounting-overview-query.dto';
import {
  RetailAccountingPayoutExceptionTypeFilter,
  RetailAccountingPayoutExceptionsQueryDto,
  RetailAccountingPayoutPriorityFilter,
} from './dto/retail-accounting-payout-exceptions-query.dto';
import { RetailAccountingPayoutExceptionsResponseDto } from './dto/retail-accounting-payout-exceptions-response.dto';
import { RetailAccountingPayoutNetworkSummaryQueryDto } from './dto/retail-accounting-payout-network-summary-query.dto';
import { RetailAccountingPayoutNetworkSummaryResponseDto } from './dto/retail-accounting-payout-network-summary-response.dto';
import { RetailAccountingOverviewResponseDto } from './dto/retail-accounting-overview-response.dto';
import { RetailAccountingNetworkSummaryResponseDto } from './dto/retail-accounting-network-summary-response.dto';
import { RetailAccountingNetworkSummaryQueryDto } from './dto/retail-accounting-network-summary-query.dto';
import {
  RetailAiNetworkSeverityFilter,
  RetailAiNetworkSummaryQueryDto,
} from './dto/retail-ai-network-summary-query.dto';
import { RetailAiNetworkSummaryResponseDto } from './dto/retail-ai-network-summary-response.dto';
import { RetailAiInsightsQueryDto } from './dto/retail-ai-insights-query.dto';
import { RetailAiInsightsResponseDto } from './dto/retail-ai-insights-response.dto';
import {
  RetailDesktopWorkbenchPriorityFilter,
  RetailDesktopWorkbenchQueryDto,
  RetailDesktopWorkbenchQueueFilter,
} from './dto/retail-desktop-workbench-query.dto';
import { RetailDesktopNetworkSummaryQueryDto } from './dto/retail-desktop-network-summary-query.dto';
import { RetailDesktopNetworkSummaryResponseDto } from './dto/retail-desktop-network-summary-response.dto';
import {
  RetailDesktopSyncFailedEntryPriorityFilter,
  RetailDesktopSyncFailedEntriesQueryDto,
} from './dto/retail-desktop-sync-failed-entries-query.dto';
import { RetailDesktopSyncFailedEntriesResponseDto } from './dto/retail-desktop-sync-failed-entries-response.dto';
import { RetailDesktopTransferDetailQueryDto } from './dto/retail-desktop-transfer-detail-query.dto';
import { RetailDesktopTransferDetailResponseDto } from './dto/retail-desktop-transfer-detail-response.dto';
import { RetailDesktopStockExceptionDetailQueryDto } from './dto/retail-desktop-stock-exception-detail-query.dto';
import { RetailDesktopStockExceptionDetailResponseDto } from './dto/retail-desktop-stock-exception-detail-response.dto';
import { RetailDesktopWorkbenchResponseDto } from './dto/retail-desktop-workbench-response.dto';
import {
  RetailStockHealthNetworkStatusFilter,
  RetailStockHealthNetworkSummaryQueryDto,
} from './dto/retail-stock-health-network-summary-query.dto';
import { RetailStockHealthNetworkSummaryResponseDto } from './dto/retail-stock-health-network-summary-response.dto';
import { RetailBranchProductsQueryDto } from './dto/retail-branch-products-query.dto';
import { RetailBranchProductsResponseDto } from './dto/retail-branch-products-response.dto';
import { RetailStockHealthQueryDto } from './dto/retail-stock-health-query.dto';
import { RetailStockHealthResponseDto } from './dto/retail-stock-health-response.dto';
import { ReplenishmentPolicySubmissionMode } from './dto/upsert-tenant-module-entitlement.dto';

@ApiTags('Retail Ops')
@Controller('retail/v1/ops')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(new ActionPathNormalizationInterceptor())
export class RetailOpsController {
  constructor(
    private readonly retailOpsService: RetailOpsService,
    private readonly retailAttendanceService: RetailAttendanceService,
  ) {}

  @Get('hr-attendance')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a branch staff attendance summary, late arrivals, and active shift coverage for the requested window',
  })
  @ApiOkResponse({ type: RetailHrAttendanceResponseDto })
  hrAttendance(@Req() req, @Query() query: RetailHrAttendanceQueryDto) {
    return this.retailAttendanceService.getAttendanceSummary(query, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Get('hr-attendance/staff/:userId')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get detailed attendance history and action hints for a specific branch staff member',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiOkResponse({ type: RetailHrAttendanceDetailResponseDto })
  hrAttendanceDetail(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req,
    @Query() query: RetailHrAttendanceDetailQueryDto,
  ) {
    return this.retailAttendanceService.getAttendanceDetail(userId, query, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Get('hr-attendance/staff/:userId/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary:
      'Export detailed attendance history for a specific branch staff member as CSV',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  async hrAttendanceDetailExport(
    @Param('userId', ParseIntPipe) userId: number,
    @Res() res: Response,
    @Req() req,
    @Query() query: RetailHrAttendanceDetailQueryDto,
  ) {
    const csv = await this.retailAttendanceService.exportAttendanceDetailCsv(
      userId,
      query,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
      },
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_hr_attendance_staff_${userId}_${query.branchId}_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('hr-attendance/exceptions')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get branch attendance exceptions for absent staff, late arrivals, and overtime shifts',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'queueType',
    enum: RetailHrAttendanceExceptionQueueFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailHrAttendanceExceptionPriorityFilter,
    required: false,
  })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiOkResponse({ type: RetailHrAttendanceExceptionsResponseDto })
  hrAttendanceExceptions(
    @Req() req,
    @Query() query: RetailHrAttendanceExceptionsQueryDto,
  ) {
    return this.retailAttendanceService.getAttendanceExceptions(query, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Get('hr-attendance/exceptions/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export branch attendance exceptions as CSV' })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'queueType',
    enum: RetailHrAttendanceExceptionQueueFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailHrAttendanceExceptionPriorityFilter,
    required: false,
  })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  async hrAttendanceExceptionsExport(
    @Res() res: Response,
    @Req() req,
    @Query() query: RetailHrAttendanceExceptionsQueryDto,
  ) {
    const csv =
      await this.retailAttendanceService.exportAttendanceExceptionsCsv(query, {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
      });
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_hr_attendance_exceptions_${query.branchId}_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('hr-attendance/network-summary')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a tenant-level HR attendance summary across branches for HQ staffing and shift risk monitoring',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'risk',
    enum: RetailHrAttendanceNetworkRiskFilter,
    required: false,
  })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiOkResponse({ type: RetailHrAttendanceNetworkSummaryResponseDto })
  hrAttendanceNetworkSummary(
    @Req() req,
    @Query() query: RetailHrAttendanceNetworkSummaryQueryDto,
  ) {
    return this.retailAttendanceService.getAttendanceNetworkSummary(query, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Get('hr-attendance/network-summary/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary:
      'Export a tenant-level HR attendance summary across branches as CSV',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'risk',
    enum: RetailHrAttendanceNetworkRiskFilter,
    required: false,
  })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  async hrAttendanceNetworkSummaryExport(
    @Res() res: Response,
    @Query() query: RetailHrAttendanceNetworkSummaryQueryDto,
  ) {
    const csv =
      await this.retailAttendanceService.exportAttendanceNetworkSummaryCsv(
        query,
      );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_hr_attendance_network_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('hr-attendance/compliance-summary')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get tenant-level HR attendance compliance aggregates across branches for HQ dashboards and audit review',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({ name: 'branchIds', type: String, required: false })
  @ApiQuery({ name: 'userIds', type: String, required: false })
  @ApiQuery({ name: 'statuses', type: String, required: false })
  @ApiQuery({ name: 'queueTypes', type: String, required: false })
  @ApiQuery({ name: 'priorities', type: String, required: false })
  @ApiOkResponse({ type: RetailHrAttendanceComplianceSummaryResponseDto })
  hrAttendanceComplianceSummary(
    @Req() req,
    @Query() query: RetailHrAttendanceComplianceExportQueryDto,
  ) {
    return this.retailAttendanceService.getAttendanceComplianceSummary(query, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Get('hr-attendance/compliance-export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary:
      'Export tenant-level HR attendance compliance rows across branches for HQ payroll and audit review',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({ name: 'branchIds', type: String, required: false })
  @ApiQuery({ name: 'userIds', type: String, required: false })
  @ApiQuery({ name: 'statuses', type: String, required: false })
  @ApiQuery({ name: 'queueTypes', type: String, required: false })
  @ApiQuery({ name: 'priorities', type: String, required: false })
  async hrAttendanceComplianceExport(
    @Res() res: Response,
    @Query() query: RetailHrAttendanceComplianceExportQueryDto,
  ) {
    const csv =
      await this.retailAttendanceService.exportAttendanceComplianceCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_hr_attendance_compliance_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Post('hr-attendance/check-in')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('body.branchId')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Check the current branch staff user into an active HR attendance shift for the specified branch',
  })
  @ApiBody({ type: MutateRetailHrAttendanceDto })
  @ApiOkResponse({ type: RetailHrAttendanceMutationResponseDto })
  hrAttendanceCheckIn(@Body() dto: MutateRetailHrAttendanceDto, @Req() req) {
    return this.retailAttendanceService.checkIn(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Post('hr-attendance/check-out')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('body.branchId')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Check the current branch staff user out of the active HR attendance shift for the specified branch',
  })
  @ApiBody({ type: MutateRetailHrAttendanceDto })
  @ApiOkResponse({ type: RetailHrAttendanceMutationResponseDto })
  hrAttendanceCheckOut(@Body() dto: MutateRetailHrAttendanceDto, @Req() req) {
    return this.retailAttendanceService.checkOut(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Post('hr-attendance/overrides/check-in')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('body.branchId')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Backfill or override a branch staff check-in for the specified branch when the acting user has attendance override authority',
  })
  @ApiBody({ type: OverrideRetailHrAttendanceCheckInDto })
  @ApiOkResponse({ type: RetailHrAttendanceMutationResponseDto })
  hrAttendanceOverrideCheckIn(
    @Body() dto: OverrideRetailHrAttendanceCheckInDto,
    @Req() req,
  ) {
    return this.retailAttendanceService.overrideCheckIn(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Post('hr-attendance/overrides/check-out')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.HR_ATTENDANCE)
  @RetailBranchContext('body.branchId')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Force-close or override a branch staff check-out for the specified branch when the acting user has attendance override authority',
  })
  @ApiBody({ type: OverrideRetailHrAttendanceCheckOutDto })
  @ApiOkResponse({ type: RetailHrAttendanceMutationResponseDto })
  hrAttendanceOverrideCheckOut(
    @Body() dto: OverrideRetailHrAttendanceCheckOutDto,
    @Req() req,
  ) {
    return this.retailAttendanceService.overrideCheckOut(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Get('network-command-center')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a tenant-level HQ command center summary spanning the active Retail OS operations modules for the requested branch tenant',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'branchLimit', type: Number, required: false })
  @ApiQuery({ name: 'module', enum: RetailOsModule, required: false })
  @ApiQuery({
    name: 'status',
    enum: RetailCommandCenterStatusFilter,
    required: false,
  })
  @ApiQuery({ name: 'hasAlertsOnly', type: Boolean, required: false })
  @ApiQuery({
    name: 'alertSeverity',
    enum: RetailCommandCenterAlertSeverityFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailCommandCenterSummaryResponseDto })
  networkCommandCenter(@Query() query: RetailCommandCenterSummaryQueryDto) {
    return this.retailOpsService.getNetworkCommandCenterSummary(query);
  }

  @Get('network-command-center/report-snapshots/latest')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get the latest persisted reporting snapshot for the tenant-level HQ command center for the requested filter set',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'branchLimit', type: Number, required: false })
  @ApiQuery({ name: 'module', enum: RetailOsModule, required: false })
  @ApiQuery({
    name: 'status',
    enum: RetailCommandCenterStatusFilter,
    required: false,
  })
  @ApiQuery({ name: 'hasAlertsOnly', type: Boolean, required: false })
  @ApiQuery({
    name: 'alertSeverity',
    enum: RetailCommandCenterAlertSeverityFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailCommandCenterReportSnapshotResponseDto })
  latestNetworkCommandCenterReportSnapshot(
    @Query() query: RetailCommandCenterSummaryQueryDto,
  ) {
    return this.retailOpsService.getLatestNetworkCommandCenterReportSnapshot(
      query,
    );
  }

  @Post('network-command-center/report-snapshots')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RetailBranchContext('query.branchId')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Capture and persist a reporting snapshot of the tenant-level HQ command center for scheduled reporting and future trend comparison',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'branchLimit', type: Number, required: false })
  @ApiQuery({ name: 'module', enum: RetailOsModule, required: false })
  @ApiQuery({
    name: 'status',
    enum: RetailCommandCenterStatusFilter,
    required: false,
  })
  @ApiQuery({ name: 'hasAlertsOnly', type: Boolean, required: false })
  @ApiQuery({
    name: 'alertSeverity',
    enum: RetailCommandCenterAlertSeverityFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailCommandCenterReportSnapshotResponseDto })
  networkCommandCenterReportSnapshot(
    @Query() query: RetailCommandCenterSummaryQueryDto,
  ) {
    return this.retailOpsService.captureNetworkCommandCenterReportSnapshot(
      query,
    );
  }

  @Get('network-command-center/export')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary: 'Export the tenant-level HQ command center summary as CSV',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'branchLimit', type: Number, required: false })
  @ApiQuery({ name: 'module', enum: RetailOsModule, required: false })
  @ApiQuery({
    name: 'status',
    enum: RetailCommandCenterStatusFilter,
    required: false,
  })
  @ApiQuery({ name: 'hasAlertsOnly', type: Boolean, required: false })
  @ApiQuery({
    name: 'alertSeverity',
    enum: RetailCommandCenterAlertSeverityFilter,
    required: false,
  })
  async networkCommandCenterExport(
    @Res() res: Response,
    @Query() query: RetailCommandCenterSummaryQueryDto,
  ) {
    const csv =
      await this.retailOpsService.exportNetworkCommandCenterSummaryCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_network_command_center_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('pos-operations')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a branch POS operations snapshot covering sales throughput, payment exceptions, and fulfillment backlog',
  })
  @ApiOkResponse({ type: RetailPosOperationsResponseDto })
  posOperations(@Query() query: RetailPosOperationsQueryDto) {
    return this.retailOpsService.getPosOperations(query);
  }

  @Get('pos-operations/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export a branch POS operations snapshot as CSV' })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({ name: 'topItemsLimit', type: Number, required: false })
  async posOperationsExport(
    @Res() res: Response,
    @Query() query: RetailPosOperationsQueryDto,
  ) {
    const csv = await this.retailOpsService.exportPosOperationsCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_pos_operations_${query.branchId}_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('pos-operations/network-summary')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a tenant-level POS operations summary across branches anchored to the requested branch',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'status',
    enum: RetailPosNetworkStatusFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailPosNetworkSummaryResponseDto })
  posNetworkSummary(@Query() query: RetailPosNetworkSummaryQueryDto) {
    return this.retailOpsService.getPosNetworkSummary(query);
  }

  @Get('pos-operations/network-summary/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary:
      'Export a tenant-level POS operations summary across branches as CSV',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'status',
    enum: RetailPosNetworkStatusFilter,
    required: false,
  })
  async posNetworkSummaryExport(
    @Res() res: Response,
    @Query() query: RetailPosNetworkSummaryQueryDto,
  ) {
    const csv = await this.retailOpsService.exportPosNetworkSummaryCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_pos_operations_network_summary_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('pos-operations/exceptions')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get actionable POS exception queues for failed payments, payment-proof review, and delayed fulfillment orders',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'queueType',
    enum: RetailPosExceptionQueueFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailPosExceptionPriorityFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailPosExceptionsResponseDto })
  posExceptions(@Query() query: RetailPosExceptionsQueryDto) {
    return this.retailOpsService.getPosExceptions(query);
  }

  @Get('pos-operations/exceptions/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export the branch POS exception queue as CSV' })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'queueType',
    enum: RetailPosExceptionQueueFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailPosExceptionPriorityFilter,
    required: false,
  })
  async posExceptionsExport(
    @Res() res: Response,
    @Query() query: RetailPosExceptionsQueryDto,
  ) {
    const csv = await this.retailOpsService.exportPosExceptionsCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_pos_exceptions_${query.branchId}_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('pos-operations/exceptions/network-summary')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a tenant-level POS exception summary across branches anchored to the requested branch',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'queueType',
    enum: RetailPosExceptionQueueFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailPosExceptionPriorityFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailPosExceptionNetworkSummaryResponseDto })
  posExceptionNetworkSummary(
    @Query() query: RetailPosExceptionNetworkSummaryQueryDto,
  ) {
    return this.retailOpsService.getPosExceptionNetworkSummary(query);
  }

  @Get('pos-operations/exceptions/network-summary/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary:
      'Export a tenant-level POS exception summary across branches as CSV',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'queueType',
    enum: RetailPosExceptionQueueFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailPosExceptionPriorityFilter,
    required: false,
  })
  async posExceptionNetworkSummaryExport(
    @Res() res: Response,
    @Query() query: RetailPosExceptionNetworkSummaryQueryDto,
  ) {
    const csv =
      await this.retailOpsService.exportPosExceptionNetworkSummaryCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_pos_exception_network_summary_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('pos-operations/orders/:id')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get POS order drilldown detail for a branch exception or review queue item',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiOkResponse({ type: RetailPosOrderDetailResponseDto })
  posOrderDetail(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RetailPosOrderDetailQueryDto,
  ) {
    return this.retailOpsService.getPosOrderDetail(id, query);
  }

  @Get('stock-health')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.INVENTORY_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary: 'Get a branch stock-health summary and the most at-risk SKUs',
  })
  @ApiOkResponse({ type: RetailStockHealthResponseDto })
  stockHealth(@Query() query: RetailStockHealthQueryDto) {
    return this.retailOpsService.getStockHealth(query);
  }

  @Get('branch-products')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.INVENTORY_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a unified branch product view that merges branch inventory state with vendor product identity and business profile fields',
  })
  @ApiOkResponse({ type: RetailBranchProductsResponseDto })
  branchProducts(@Query() query: RetailBranchProductsQueryDto) {
    return this.retailOpsService.getBranchProducts(query);
  }

  @Get('stock-health/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.INVENTORY_CORE)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export a branch stock-health snapshot as CSV' })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async stockHealthExport(
    @Res() res: Response,
    @Query() query: RetailStockHealthQueryDto,
  ) {
    const csv = await this.retailOpsService.exportStockHealthCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_stock_health_${query.branchId}_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('stock-health/network-summary')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.INVENTORY_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a tenant-level stock-health summary across branches anchored to the requested branch',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'stockStatus',
    enum: RetailStockHealthNetworkStatusFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailStockHealthNetworkSummaryResponseDto })
  stockHealthNetworkSummary(
    @Query() query: RetailStockHealthNetworkSummaryQueryDto,
  ) {
    return this.retailOpsService.getStockHealthNetworkSummary(query);
  }

  @Get('stock-health/network-summary/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.INVENTORY_CORE)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary:
      'Export a tenant-level stock-health summary across branches as CSV',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'stockStatus',
    enum: RetailStockHealthNetworkStatusFilter,
    required: false,
  })
  async stockHealthNetworkSummaryExport(
    @Res() res: Response,
    @Query() query: RetailStockHealthNetworkSummaryQueryDto,
  ) {
    const csv =
      await this.retailOpsService.exportStockHealthNetworkSummaryCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_stock_health_network_summary_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('ai-insights')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.AI_ANALYTICS)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get AI-generated branch operating insights and prioritized SKU risk signals',
  })
  @ApiOkResponse({ type: RetailAiInsightsResponseDto })
  aiInsights(@Query() query: RetailAiInsightsQueryDto) {
    return this.retailOpsService.getAiInsights(query);
  }

  @Get('ai-insights/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.AI_ANALYTICS)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export branch AI operating insights as CSV' })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async aiInsightsExport(
    @Res() res: Response,
    @Query() query: RetailAiInsightsQueryDto,
  ) {
    const csv = await this.retailOpsService.exportAiInsightsCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_ai_insights_${query.branchId}_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('ai-insights/network-summary')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.AI_ANALYTICS)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a tenant-level AI operating summary across branches anchored to the requested branch',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'severity',
    enum: RetailAiNetworkSeverityFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailAiNetworkSummaryResponseDto })
  aiNetworkSummary(@Query() query: RetailAiNetworkSummaryQueryDto) {
    return this.retailOpsService.getAiNetworkSummary(query);
  }

  @Get('ai-insights/network-summary/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.AI_ANALYTICS)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary:
      'Export a tenant-level AI operating summary across branches as CSV',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'severity',
    enum: RetailAiNetworkSeverityFilter,
    required: false,
  })
  async aiNetworkSummaryExport(
    @Res() res: Response,
    @Query() query: RetailAiNetworkSummaryQueryDto,
  ) {
    const csv = await this.retailOpsService.exportAiNetworkSummaryCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_ai_network_summary_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('accounting-overview')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.ACCOUNTING)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a branch accounting overview for open commitments, receipt discrepancies, and reconciliation readiness',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'supplierProfileId', type: Number, required: false })
  @ApiQuery({ name: 'slaBreachedOnly', type: Boolean, required: false })
  @ApiQuery({
    name: 'accountingState',
    enum: RetailAccountingStateFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailAccountingPriorityFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailAccountingOverviewResponseDto })
  accountingOverview(@Query() query: RetailAccountingOverviewQueryDto) {
    return this.retailOpsService.getAccountingOverview(query);
  }

  @Get('accounting-overview/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.ACCOUNTING)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export a branch accounting overview as CSV' })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'supplierProfileId', type: Number, required: false })
  @ApiQuery({ name: 'slaBreachedOnly', type: Boolean, required: false })
  @ApiQuery({
    name: 'accountingState',
    enum: RetailAccountingStateFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailAccountingPriorityFilter,
    required: false,
  })
  async accountingOverviewExport(
    @Res() res: Response,
    @Query() query: RetailAccountingOverviewQueryDto,
  ) {
    const csv = await this.retailOpsService.exportAccountingOverviewCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_accounting_overview_${query.branchId}_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('accounting-overview/network-summary')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.ACCOUNTING)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a tenant-level accounting summary across branches anchored to the requested branch',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'priority',
    enum: RetailAccountingPriorityFilter,
    required: false,
  })
  @ApiQuery({
    name: 'accountingState',
    enum: RetailAccountingStateFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailAccountingNetworkSummaryResponseDto })
  accountingNetworkSummary(
    @Query() query: RetailAccountingNetworkSummaryQueryDto,
  ) {
    return this.retailOpsService.getAccountingNetworkSummary(query);
  }

  @Get('accounting-overview/network-summary/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.ACCOUNTING)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary: 'Export a tenant-level accounting summary across branches as CSV',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'priority',
    enum: RetailAccountingPriorityFilter,
    required: false,
  })
  @ApiQuery({
    name: 'accountingState',
    enum: RetailAccountingStateFilter,
    required: false,
  })
  async accountingNetworkSummaryExport(
    @Res() res: Response,
    @Query() query: RetailAccountingNetworkSummaryQueryDto,
  ) {
    const csv =
      await this.retailOpsService.exportAccountingNetworkSummaryCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_accounting_network_summary_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('accounting-overview/payout-exceptions')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.ACCOUNTING)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a branch payout-exception queue for failed auto payouts and reconciliation-required payout debits',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'exceptionType',
    enum: RetailAccountingPayoutExceptionTypeFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailAccountingPayoutPriorityFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailAccountingPayoutExceptionsResponseDto })
  accountingPayoutExceptions(
    @Query() query: RetailAccountingPayoutExceptionsQueryDto,
  ) {
    return this.retailOpsService.getAccountingPayoutExceptions(query);
  }

  @Get('accounting-overview/payout-exceptions/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.ACCOUNTING)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export a branch payout-exception queue as CSV' })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'exceptionType',
    enum: RetailAccountingPayoutExceptionTypeFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailAccountingPayoutPriorityFilter,
    required: false,
  })
  async accountingPayoutExceptionsExport(
    @Res() res: Response,
    @Query() query: RetailAccountingPayoutExceptionsQueryDto,
  ) {
    const csv =
      await this.retailOpsService.exportAccountingPayoutExceptionsCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_accounting_payout_exceptions_${query.branchId}_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('accounting-overview/payout-exceptions/network-summary')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.ACCOUNTING)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a tenant-level payout-exception summary across branches anchored to the requested branch',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'exceptionType',
    enum: RetailAccountingPayoutExceptionTypeFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailAccountingPayoutPriorityFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailAccountingPayoutNetworkSummaryResponseDto })
  accountingPayoutNetworkSummary(
    @Query() query: RetailAccountingPayoutNetworkSummaryQueryDto,
  ) {
    return this.retailOpsService.getAccountingPayoutNetworkSummary(query);
  }

  @Get('accounting-overview/payout-exceptions/network-summary/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.ACCOUNTING)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary:
      'Export a tenant-level payout-exception summary across branches as CSV',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'exceptionType',
    enum: RetailAccountingPayoutExceptionTypeFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailAccountingPayoutPriorityFilter,
    required: false,
  })
  async accountingPayoutNetworkSummaryExport(
    @Res() res: Response,
    @Query() query: RetailAccountingPayoutNetworkSummaryQueryDto,
  ) {
    const csv =
      await this.retailOpsService.exportAccountingPayoutNetworkSummaryCsv(
        query,
      );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_accounting_payout_network_summary_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('desktop-workbench')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.DESKTOP_BACKOFFICE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a branch desktop back-office workbench for sync failures, transfer backlog, and inventory adjustment exceptions',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'queueType',
    enum: RetailDesktopWorkbenchQueueFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailDesktopWorkbenchPriorityFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailDesktopWorkbenchResponseDto })
  desktopWorkbench(@Query() query: RetailDesktopWorkbenchQueryDto) {
    return this.retailOpsService.getDesktopWorkbench(query);
  }

  @Get('desktop-workbench/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.DESKTOP_BACKOFFICE)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary: 'Export a branch desktop back-office workbench as CSV',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'queueType',
    enum: RetailDesktopWorkbenchQueueFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailDesktopWorkbenchPriorityFilter,
    required: false,
  })
  async desktopWorkbenchExport(
    @Res() res: Response,
    @Query() query: RetailDesktopWorkbenchQueryDto,
  ) {
    const csv = await this.retailOpsService.exportDesktopWorkbenchCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_desktop_workbench_${query.branchId}_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('desktop-workbench/network-summary')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.DESKTOP_BACKOFFICE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a tenant-level desktop back-office summary across branches anchored to the requested branch',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'queueType',
    enum: RetailDesktopWorkbenchQueueFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailDesktopWorkbenchPriorityFilter,
    required: false,
  })
  @ApiOkResponse({ type: RetailDesktopNetworkSummaryResponseDto })
  desktopNetworkSummary(@Query() query: RetailDesktopNetworkSummaryQueryDto) {
    return this.retailOpsService.getDesktopNetworkSummary(query);
  }

  @Get('desktop-workbench/network-summary/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.DESKTOP_BACKOFFICE)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary:
      'Export a tenant-level desktop back-office summary across branches as CSV',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({ name: 'windowHours', type: Number, required: false })
  @ApiQuery({
    name: 'queueType',
    enum: RetailDesktopWorkbenchQueueFilter,
    required: false,
  })
  @ApiQuery({
    name: 'priority',
    enum: RetailDesktopWorkbenchPriorityFilter,
    required: false,
  })
  async desktopNetworkSummaryExport(
    @Res() res: Response,
    @Query() query: RetailDesktopNetworkSummaryQueryDto,
  ) {
    const csv =
      await this.retailOpsService.exportDesktopNetworkSummaryCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_desktop_network_summary_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('desktop-workbench/sync-jobs/:id/failed-entries')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.DESKTOP_BACKOFFICE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary: 'Get failed POS sync entries for a branch desktop workbench job',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'priority',
    enum: RetailDesktopSyncFailedEntryPriorityFilter,
    required: false,
  })
  @ApiQuery({ name: 'movementType', type: String, required: false })
  @ApiQuery({ name: 'transferOnly', type: Boolean, required: false })
  @ApiOkResponse({ type: RetailDesktopSyncFailedEntriesResponseDto })
  desktopSyncJobFailedEntries(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RetailDesktopSyncFailedEntriesQueryDto,
  ) {
    return this.retailOpsService.getDesktopSyncJobFailedEntries(id, query);
  }

  @Get('desktop-workbench/transfers/:id')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.DESKTOP_BACKOFFICE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary: 'Get branch transfer detail for a desktop workbench transfer item',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'includeItems', type: Boolean, required: false })
  @ApiOkResponse({ type: RetailDesktopTransferDetailResponseDto })
  desktopTransferDetail(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RetailDesktopTransferDetailQueryDto,
    @Req() req,
  ) {
    return this.retailOpsService.getDesktopTransferDetail(id, query, {
      id: req.user?.id ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Get('desktop-workbench/stock-exceptions/:id')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.DESKTOP_BACKOFFICE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get stock adjustment exception detail for a desktop workbench item',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiOkResponse({ type: RetailDesktopStockExceptionDetailResponseDto })
  desktopStockExceptionDetail(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: RetailDesktopStockExceptionDetailQueryDto,
  ) {
    return this.retailOpsService.getDesktopStockExceptionDetail(id, query);
  }

  @Get('replenishment-drafts')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.INVENTORY_AUTOMATION)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary: 'List auto-replenishment draft purchase orders awaiting review',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'supplierProfileId', type: Number, required: false })
  @ApiQuery({
    name: 'autoReplenishmentSubmissionMode',
    enum: ReplenishmentPolicySubmissionMode,
    required: false,
  })
  @ApiQuery({
    name: 'autoReplenishmentBlockedReason',
    type: String,
    required: false,
  })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiOkResponse({ type: RetailReplenishmentReviewResponseDto })
  replenishmentDrafts(@Query() query: RetailReplenishmentReviewQueryDto) {
    return this.retailOpsService.listReplenishmentDrafts(query);
  }

  @Get('replenishment-drafts/network-summary')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.INVENTORY_AUTOMATION)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary:
      'Get a tenant-level replenishment automation summary across branches anchored to the requested branch',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'supplierProfileId', type: Number, required: false })
  @ApiQuery({
    name: 'autoReplenishmentSubmissionMode',
    enum: ReplenishmentPolicySubmissionMode,
    required: false,
  })
  @ApiQuery({
    name: 'autoReplenishmentBlockedReason',
    type: String,
    required: false,
  })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiOkResponse({ type: RetailReplenishmentNetworkSummaryResponseDto })
  replenishmentNetworkSummary(
    @Query() query: RetailReplenishmentNetworkSummaryQueryDto,
  ) {
    return this.retailOpsService.getReplenishmentNetworkSummary(query);
  }

  @Get('replenishment-drafts/network-summary/export')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.INVENTORY_AUTOMATION)
  @RetailBranchContext('query.branchId')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary:
      'Export a tenant-level replenishment automation summary across branches as CSV',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiQuery({ name: 'supplierProfileId', type: Number, required: false })
  @ApiQuery({
    name: 'autoReplenishmentSubmissionMode',
    enum: ReplenishmentPolicySubmissionMode,
    required: false,
  })
  @ApiQuery({
    name: 'autoReplenishmentBlockedReason',
    type: String,
    required: false,
  })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async replenishmentNetworkSummaryExport(
    @Res() res: Response,
    @Query() query: RetailReplenishmentNetworkSummaryQueryDto,
  ) {
    const csv =
      await this.retailOpsService.exportReplenishmentNetworkSummaryCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="retail_replenishment_network_summary_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Post('replenishment-drafts/:id/re-evaluate')
  @UseGuards(RetailModulesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  @RequireRetailModules(RetailOsModule.INVENTORY_AUTOMATION)
  @RetailBranchContext('query.branchId')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Re-evaluate an auto-replenishment draft for the current branch against the latest automation policy',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: true })
  @ApiOkResponse({ type: RetailReplenishmentReevaluationResponseDto })
  reevaluateReplenishmentDraft(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
    @Req() req,
  ) {
    return this.retailOpsService.reevaluateReplenishmentDraft(branchId, id, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }
}
