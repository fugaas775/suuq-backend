import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AuditService } from '../audit/audit.service';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { StockMovementType } from '../branches/entities/stock-movement.entity';
import { BranchTransferStatus } from '../branches/entities/branch-transfer.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { PurchaseOrderStatus } from '../purchase-orders/entities/purchase-order.entity';
import { ApprovePurchaseOrderReceiptDiscrepancyDto } from '../purchase-orders/dto/approve-purchase-order-receipt-discrepancy.dto';
import { PartnerCredentialsService } from '../partner-credentials/partner-credentials.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { AdminB2bService } from './b2b.admin.service';
import { SupplierOnboardingStatus } from '../suppliers/entities/supplier-profile.entity';
import { AdminSupplierReviewDto } from './dto/admin-supplier-review.dto';
import { BranchTransferPageResponseDto } from './dto/branch-transfer-page-response.dto';
import { BranchTransferQueryDto } from './dto/branch-transfer-query.dto';
import { BranchTransferResponseDto } from './dto/branch-transfer-response.dto';
import { BranchInventoryPageResponseDto } from './dto/branch-inventory-page-response.dto';
import { BranchInventoryQueryDto } from './dto/branch-inventory-query.dto';
import { ForceClosePurchaseOrderReceiptDiscrepancyDto } from './dto/force-close-purchase-order-receipt-discrepancy.dto';
import { PosSyncJobPageResponseDto } from './dto/pos-sync-job-page-response.dto';
import { PosSyncJobQueryDto } from './dto/pos-sync-job-query.dto';
import { PosSyncJobResponseDto } from './dto/pos-sync-job-response.dto';
import { PurchaseOrderPageResponseDto } from './dto/purchase-order-page-response.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import { AdminPurchaseOrderReevaluationResponseDto } from './dto/purchase-order-response.dto';
import { PurchaseOrderReceiptEventPageResponseDto } from './dto/purchase-order-receipt-event-page-response.dto';
import { RotatePartnerCredentialBranchDto } from './dto/rotate-partner-credential-branch.dto';
import { RevokePartnerCredentialDto } from './dto/revoke-partner-credential.dto';
import { StockMovementPageResponseDto } from './dto/stock-movement-page-response.dto';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { SupplierReviewQueueQueryDto } from './dto/supplier-review-queue-query.dto';
import {
  PosSyncStatus,
  PosSyncType,
} from '../pos-sync/entities/pos-sync-job.entity';
import { ReplenishmentPolicySubmissionMode } from '../retail/dto/upsert-tenant-module-entitlement.dto';

@ApiTags('Admin - B2B')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/b2b')
export class AdminB2bController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly partnerCredentialsService: PartnerCredentialsService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly auditService: AuditService,
    private readonly adminB2bService: AdminB2bService,
  ) {}

  @Get('supplier-profiles/review-queue')
  @ApiOperation({
    summary: 'List supplier profiles awaiting or matching review status',
  })
  @ApiQuery({ name: 'status', enum: SupplierOnboardingStatus, required: false })
  reviewQueue(@Query() query: SupplierReviewQueueQueryDto) {
    return this.suppliersService.findReviewQueue(
      query.status ?? SupplierOnboardingStatus.PENDING_REVIEW,
    );
  }

  @Get('purchase-orders/:id/audit')
  @ApiOperation({ summary: 'List audit-log entries for a purchase order' })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  purchaseOrderAudit(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.listForTarget(
      'PURCHASE_ORDER',
      id,
      Number(limit) || 20,
    );
  }

  @Get('branch-inventory')
  @ApiOperation({ summary: 'List branch inventory records' })
  @ApiQuery({ name: 'branchId', type: Number, required: false })
  @ApiQuery({ name: 'productId', type: Number, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiOkResponse({ type: BranchInventoryPageResponseDto })
  branchInventory(@Query() query: BranchInventoryQueryDto) {
    return this.adminB2bService.listBranchInventory(query);
  }

  @Get('branch-transfers')
  @ApiOperation({ summary: 'List persisted branch transfer documents' })
  @ApiQuery({ name: 'fromBranchId', type: Number, required: false })
  @ApiQuery({ name: 'toBranchId', type: Number, required: false })
  @ApiQuery({ name: 'status', required: false, enum: BranchTransferStatus })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiOkResponse({ type: BranchTransferPageResponseDto })
  branchTransfers(@Query() query: BranchTransferQueryDto) {
    return this.adminB2bService.listBranchTransfers(query);
  }

  @Get('purchase-orders')
  @ApiOperation({
    summary:
      'List purchase orders for admin B2B ops review, including auto-replenishment drafts',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: false })
  @ApiQuery({ name: 'supplierProfileId', type: Number, required: false })
  @ApiQuery({ name: 'status', required: false, enum: PurchaseOrderStatus })
  @ApiQuery({ name: 'autoReplenishment', type: Boolean, required: false })
  @ApiQuery({
    name: 'autoReplenishmentSubmissionMode',
    required: false,
    enum: ReplenishmentPolicySubmissionMode,
  })
  @ApiQuery({
    name: 'autoReplenishmentBlockedReason',
    type: String,
    required: false,
  })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiOkResponse({ type: PurchaseOrderPageResponseDto })
  purchaseOrders(@Query() query: PurchaseOrderQueryDto) {
    return this.adminB2bService.listPurchaseOrders(query);
  }

  @Get('branch-transfers/:id')
  @ApiOperation({ summary: 'Inspect a branch transfer document' })
  @ApiOkResponse({ type: BranchTransferResponseDto })
  branchTransfer(@Param('id', ParseIntPipe) id: number) {
    return this.adminB2bService.getBranchTransfer(id);
  }

  @Get('stock-movements')
  @ApiOperation({
    summary: 'List stock movement history with optional filters',
  })
  @ApiQuery({ name: 'branchId', type: Number, required: false })
  @ApiQuery({ name: 'productId', type: Number, required: false })
  @ApiQuery({ name: 'movementType', required: false, enum: StockMovementType })
  @ApiQuery({ name: 'from', type: String, required: false })
  @ApiQuery({ name: 'to', type: String, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiOkResponse({ type: StockMovementPageResponseDto })
  stockMovements(@Query() query: StockMovementQueryDto) {
    return this.adminB2bService.listStockMovements(query);
  }

  @Get('purchase-orders/:id/receipt-events')
  @ApiOperation({
    summary:
      'List receipt events for a purchase order from the admin B2B surface',
  })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiOkResponse({ type: PurchaseOrderReceiptEventPageResponseDto })
  purchaseOrderReceiptEvents(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminB2bService.listPurchaseOrderReceiptEvents(
      id,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  @Patch('purchase-orders/:id/re-evaluate-auto-replenishment')
  @ApiOperation({
    summary:
      'Re-evaluate an auto-replenishment draft against the latest automation policy from the admin B2B surface',
  })
  @ApiOkResponse({ type: AdminPurchaseOrderReevaluationResponseDto })
  reEvaluateAutoReplenishmentDraft(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.adminB2bService.reevaluateAutoReplenishmentDraft(id, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Get('pos-sync-jobs')
  @ApiOperation({ summary: 'List POS sync jobs for admin B2B ops review' })
  @ApiQuery({ name: 'branchId', type: Number, required: false })
  @ApiQuery({ name: 'partnerCredentialId', type: Number, required: false })
  @ApiQuery({ name: 'syncType', required: false, enum: PosSyncType })
  @ApiQuery({ name: 'status', required: false, enum: PosSyncStatus })
  @ApiQuery({ name: 'failedOnly', type: Boolean, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiOkResponse({ type: PosSyncJobPageResponseDto })
  posSyncJobs(@Query() query: PosSyncJobQueryDto) {
    return this.adminB2bService.listPosSyncJobs(query);
  }

  @Get('pos-sync-jobs/:id')
  @ApiOperation({
    summary:
      'Inspect a POS sync job including failed-entry details when available',
  })
  @ApiOkResponse({ type: PosSyncJobResponseDto })
  posSyncJob(@Param('id', ParseIntPipe) id: number) {
    return this.adminB2bService.getPosSyncJob(id);
  }

  @Patch('purchase-orders/:id/receipt-events/:eventId/discrepancy-approval')
  @ApiOperation({
    summary:
      'Approve a supplier-submitted receipt discrepancy resolution from the admin B2B surface',
  })
  approveReceiptEventDiscrepancy(
    @Param('id', ParseIntPipe) id: number,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() dto: ApprovePurchaseOrderReceiptDiscrepancyDto,
    @Req() req: any,
  ) {
    return this.purchaseOrdersService.approveReceiptEventDiscrepancy(
      id,
      eventId,
      dto,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
      },
    );
  }

  @Patch('purchase-orders/:id/receipt-events/:eventId/discrepancy-force-close')
  @ApiOperation({
    summary:
      'Force-close a stale receipt discrepancy from the admin B2B surface',
  })
  forceCloseReceiptEventDiscrepancy(
    @Param('id', ParseIntPipe) id: number,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() dto: ForceClosePurchaseOrderReceiptDiscrepancyDto,
    @Req() req: any,
  ) {
    return this.purchaseOrdersService.forceCloseReceiptEventDiscrepancy(
      id,
      eventId,
      dto,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
      },
    );
  }

  @Patch('supplier-profiles/:id/approve')
  approveSupplierProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminSupplierReviewDto,
    @Req() req: any,
  ) {
    return this.suppliersService.updateStatus(
      id,
      { status: SupplierOnboardingStatus.APPROVED },
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
        reason: dto.reason,
      },
    );
  }

  @Patch('supplier-profiles/:id/reject')
  rejectSupplierProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminSupplierReviewDto,
    @Req() req: any,
  ) {
    return this.suppliersService.updateStatus(
      id,
      { status: SupplierOnboardingStatus.REJECTED },
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
        reason: dto.reason,
      },
    );
  }

  @Patch('partner-credentials/:id/revoke')
  revokePartnerCredential(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevokePartnerCredentialDto,
    @Req() req: any,
  ) {
    return this.partnerCredentialsService.revoke(id, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      reason: dto.reason,
    });
  }

  @Patch('partner-credentials/:id/branch-assignment')
  @ApiOperation({
    summary:
      'Rotate the branch assignment for a POS partner credential with audit logging',
  })
  rotatePartnerCredentialBranch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RotatePartnerCredentialBranchDto,
    @Req() req: any,
  ) {
    return this.partnerCredentialsService.rotateBranchAssignment(
      id,
      dto.branchId,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        reason: dto.reason,
      },
    );
  }
}
