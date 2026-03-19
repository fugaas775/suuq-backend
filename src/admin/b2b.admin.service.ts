import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { BranchTransfer } from '../branches/entities/branch-transfer.entity';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import { StockMovement } from '../branches/entities/stock-movement.entity';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import {
  PosSyncJob,
  PosSyncStatus,
} from '../pos-sync/entities/pos-sync-job.entity';
import { PurchaseOrderReceiptEvent } from '../purchase-orders/entities/purchase-order-receipt-event.entity';
import { BranchTransferQueryDto } from './dto/branch-transfer-query.dto';
import { BranchTransferResponseDto } from './dto/branch-transfer-response.dto';
import {
  PurchaseOrderBlockedReasonCountResponseDto,
  PurchaseOrderListSummaryResponseDto,
} from './dto/purchase-order-page-response.dto';
import { PurchaseOrderQueryDto } from './dto/purchase-order-query.dto';
import {
  AdminPurchaseOrderActionResponseDto,
  AdminPurchaseOrderReevaluationResponseDto,
  AdminPurchaseOrderResponseDto,
  PurchaseOrderReevaluationOutcomeResponseDto,
  PurchaseOrderAutoReplenishmentStatusResponseDto,
  PurchaseOrderResponseDto,
} from './dto/purchase-order-response.dto';
import { PosSyncJobQueryDto } from './dto/pos-sync-job-query.dto';
import { PosSyncJobResponseDto } from './dto/pos-sync-job-response.dto';
import {
  PurchaseOrderReevaluationOutcome,
  PurchaseOrdersService,
} from '../purchase-orders/purchase-orders.service';

@Injectable()
export class AdminB2bService {
  constructor(
    @InjectRepository(BranchTransfer)
    private readonly branchTransfersRepository: Repository<BranchTransfer>,
    @InjectRepository(BranchInventory)
    private readonly branchInventoryRepository: Repository<BranchInventory>,
    @InjectRepository(StockMovement)
    private readonly stockMovementsRepository: Repository<StockMovement>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepository: Repository<PurchaseOrder>,
    @InjectRepository(PosSyncJob)
    private readonly posSyncJobsRepository: Repository<PosSyncJob>,
    @InjectRepository(PurchaseOrderReceiptEvent)
    private readonly purchaseOrderReceiptEventsRepository: Repository<PurchaseOrderReceiptEvent>,
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  async reevaluateAutoReplenishmentDraft(
    id: number,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<AdminPurchaseOrderReevaluationResponseDto> {
    const result =
      await this.purchaseOrdersService.reevaluateAutoReplenishmentDraftDetailed(
        id,
        actor,
      );

    return this.mapAdminPurchaseOrderReevaluationResponse(
      result.purchaseOrder,
      result.outcome,
    );
  }

  async listPurchaseOrders(query: PurchaseOrderQueryDto): Promise<{
    summary: PurchaseOrderListSummaryResponseDto;
    items: AdminPurchaseOrderResponseDto[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }> {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.limit ?? 20, 1), 200);

    const qb = this.purchaseOrdersRepository
      .createQueryBuilder('purchaseOrder')
      .leftJoinAndSelect('purchaseOrder.branch', 'branch')
      .leftJoinAndSelect('purchaseOrder.supplierProfile', 'supplierProfile')
      .leftJoinAndSelect('purchaseOrder.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('item.supplierOffer', 'supplierOffer')
      .orderBy('purchaseOrder.createdAt', 'DESC')
      .addOrderBy('purchaseOrder.id', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (query.branchId != null) {
      qb.andWhere('purchaseOrder.branchId = :branchId', {
        branchId: query.branchId,
      });
    }

    if (query.supplierProfileId != null) {
      qb.andWhere('purchaseOrder.supplierProfileId = :supplierProfileId', {
        supplierProfileId: query.supplierProfileId,
      });
    }

    if (query.status) {
      qb.andWhere('purchaseOrder.status = :status', { status: query.status });
    }

    if (query.autoReplenishment != null) {
      qb.andWhere(
        "COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishment', 'false') = :autoReplenishment",
        { autoReplenishment: query.autoReplenishment ? 'true' : 'false' },
      );
    }

    if (query.autoReplenishmentSubmissionMode) {
      qb.andWhere(
        "COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishmentSubmissionMode', '') = :autoReplenishmentSubmissionMode",
        {
          autoReplenishmentSubmissionMode:
            query.autoReplenishmentSubmissionMode,
        },
      );
    }

    if (query.autoReplenishmentBlockedReason) {
      qb.andWhere(
        "COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = :autoReplenishmentBlockedReason",
        {
          autoReplenishmentBlockedReason: query.autoReplenishmentBlockedReason,
        },
      );
    }

    const summaryRaw = await qb
      .clone()
      .select('COUNT(*)', 'totalPurchaseOrders')
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishment', 'false') = 'true' THEN 1 ELSE 0 END)`,
        'autoReplenishmentCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishmentSubmissionMode', '') = 'AUTO_SUBMIT' THEN 1 ELSE 0 END)`,
        'autoSubmitDraftCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishmentSubmissionMode', '') = 'AUTO_SUBMIT' AND COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') != '' THEN 1 ELSE 0 END)`,
        'blockedAutoSubmitDraftCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta ->> 'autoReplenishmentSubmissionMode', '') = 'AUTO_SUBMIT' AND COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'eligible', 'false') = 'true' THEN 1 ELSE 0 END)`,
        'readyAutoSubmitDraftCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = 'DAY_OF_WEEK_BLOCKED' THEN 1 ELSE 0 END)`,
        'dayOfWeekBlockedCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = 'HOUR_OUTSIDE_WINDOW' THEN 1 ELSE 0 END)`,
        'hourOutsideWindowBlockedCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = 'PREFERRED_SUPPLIER_REQUIRED' THEN 1 ELSE 0 END)`,
        'preferredSupplierRequiredCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = 'MINIMUM_ORDER_TOTAL_NOT_MET' THEN 1 ELSE 0 END)`,
        'minimumOrderTotalNotMetCount',
      )
      .addSelect(
        `SUM(CASE WHEN COALESCE(purchaseOrder.statusMeta -> 'lastAutoSubmissionAttempt' ->> 'blockedReason', '') = 'AUTOMATION_NOT_ENTITLED' THEN 1 ELSE 0 END)`,
        'automationNotEntitledCount',
      )
      .getRawOne();

    const [items, total] = await qb.getManyAndCount();

    return {
      summary: this.mapPurchaseOrderListSummary(summaryRaw),
      items: items.map((item) => this.mapAdminPurchaseOrder(item)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async getBranchTransfer(id: number): Promise<BranchTransferResponseDto> {
    const transfer = await this.branchTransfersRepository.findOne({
      where: { id },
      relations: {
        fromBranch: true,
        toBranch: true,
        items: { product: true },
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Branch transfer with ID ${id} not found`);
    }

    return this.mapBranchTransfer(transfer);
  }

  async listBranchTransfers(query: BranchTransferQueryDto): Promise<{
    items: BranchTransferResponseDto[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }> {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.limit ?? 20, 1), 200);

    const qb = this.branchTransfersRepository
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.fromBranch', 'fromBranch')
      .leftJoinAndSelect('transfer.toBranch', 'toBranch')
      .leftJoinAndSelect('transfer.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .orderBy('transfer.createdAt', 'DESC')
      .addOrderBy('transfer.id', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (query.fromBranchId != null) {
      qb.andWhere('transfer.fromBranchId = :fromBranchId', {
        fromBranchId: query.fromBranchId,
      });
    }

    if (query.toBranchId != null) {
      qb.andWhere('transfer.toBranchId = :toBranchId', {
        toBranchId: query.toBranchId,
      });
    }

    if (query.status) {
      qb.andWhere('transfer.status = :status', { status: query.status });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((item) => this.mapBranchTransfer(item)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async getPosSyncJob(id: number): Promise<PosSyncJobResponseDto> {
    const syncJob = await this.posSyncJobsRepository.findOne({
      where: { id },
      relations: { branch: true, partnerCredential: true },
    });

    if (!syncJob) {
      throw new NotFoundException(`POS sync job with ID ${id} not found`);
    }

    return this.mapPosSyncJob(syncJob);
  }

  async listPosSyncJobs(query: PosSyncJobQueryDto): Promise<{
    items: PosSyncJobResponseDto[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }> {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.limit ?? 20, 1), 200);

    const qb = this.posSyncJobsRepository
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.branch', 'branch')
      .leftJoinAndSelect('job.partnerCredential', 'partnerCredential')
      .orderBy('job.createdAt', 'DESC')
      .addOrderBy('job.id', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (query.branchId != null) {
      qb.andWhere('job.branchId = :branchId', { branchId: query.branchId });
    }

    if (query.partnerCredentialId != null) {
      qb.andWhere('job.partnerCredentialId = :partnerCredentialId', {
        partnerCredentialId: query.partnerCredentialId,
      });
    }

    if (query.syncType) {
      qb.andWhere('job.syncType = :syncType', { syncType: query.syncType });
    }

    if (query.status) {
      qb.andWhere('job.status = :status', { status: query.status });
    }

    if (query.failedOnly) {
      qb.andWhere(
        '(job.rejectedCount > 0 OR job.status = :failedStatus OR COALESCE(jsonb_array_length(job.failedEntries), 0) > 0)',
        { failedStatus: PosSyncStatus.FAILED },
      );
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((item) => this.mapPosSyncJob(item)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async listPurchaseOrderReceiptEvents(
    purchaseOrderId: number,
    page = 1,
    limit = 20,
  ): Promise<{
    items: PurchaseOrderReceiptEvent[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }> {
    const currentPage = Math.max(page, 1);
    const perPage = Math.min(Math.max(limit, 1), 200);
    const [items, total] =
      await this.purchaseOrderReceiptEventsRepository.findAndCount({
        where: { purchaseOrderId },
        order: { createdAt: 'DESC' },
        skip: (currentPage - 1) * perPage,
        take: perPage,
      });

    return {
      items,
      total,
      page: currentPage,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async listBranchInventory(filters: {
    branchId?: number;
    productId?: number;
    page?: number;
    limit?: number;
  }): Promise<{
    items: BranchInventory[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }> {
    const where: Record<string, number> = {};
    if (filters.branchId != null) where.branchId = filters.branchId;
    if (filters.productId != null) where.productId = filters.productId;

    const page = Math.max(filters.page ?? 1, 1);
    const perPage = Math.min(Math.max(filters.limit ?? 50, 1), 200);

    const [items, total] = await this.branchInventoryRepository.findAndCount({
      where,
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
      relations: { branch: true, product: true },
    });

    return {
      items,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async listStockMovements(filters: {
    branchId?: number;
    productId?: number;
    movementType?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: StockMovement[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }> {
    const page = Math.max(filters.page ?? 1, 1);
    const perPage = Math.min(Math.max(filters.limit ?? 50, 1), 200);

    const qb = this.stockMovementsRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.branch', 'branch')
      .leftJoinAndSelect('movement.product', 'product')
      .orderBy('movement.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (filters.branchId != null) {
      qb.andWhere('movement.branchId = :branchId', {
        branchId: filters.branchId,
      });
    }

    if (filters.productId != null) {
      qb.andWhere('movement.productId = :productId', {
        productId: filters.productId,
      });
    }

    if (filters.movementType) {
      qb.andWhere('movement.movementType = :movementType', {
        movementType: filters.movementType,
      });
    }

    if (filters.from) {
      qb.andWhere('movement.createdAt >= :from', { from: filters.from });
    }

    if (filters.to) {
      qb.andWhere('movement.createdAt <= :to', { to: filters.to });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  private mapPosSyncJob(job: PosSyncJob): PosSyncJobResponseDto {
    return {
      id: job.id,
      branchId: job.branchId ?? job.branch?.id ?? null,
      partnerCredentialId:
        job.partnerCredentialId ?? job.partnerCredential?.id ?? null,
      syncType: job.syncType,
      status: job.status,
      externalJobId: job.externalJobId ?? null,
      idempotencyKey: job.idempotencyKey ?? null,
      acceptedCount: job.acceptedCount,
      rejectedCount: job.rejectedCount,
      processedAt: job.processedAt ?? null,
      failedEntries: job.failedEntries ?? [],
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private mapPurchaseOrder(order: PurchaseOrder): PurchaseOrderResponseDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      supplierProfileId: order.supplierProfileId,
      status: order.status,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      total: Number(order.total),
      expectedDeliveryDate: order.expectedDeliveryDate ?? null,
      statusMeta: order.statusMeta ?? {},
      autoReplenishmentStatus: this.mapAutoReplenishmentStatus(
        order.statusMeta,
      ),
      items: (order.items ?? []).map((item: PurchaseOrderItem) => ({
        id: item.id,
        productId: item.productId,
        supplierOfferId: item.supplierOfferId ?? null,
        orderedQuantity: item.orderedQuantity,
        receivedQuantity: item.receivedQuantity,
        shortageQuantity: item.shortageQuantity,
        damagedQuantity: item.damagedQuantity,
        note: item.note ?? null,
        unitPrice: Number(item.unitPrice),
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private mapAdminPurchaseOrder(
    order: PurchaseOrder,
  ): AdminPurchaseOrderResponseDto {
    return {
      ...this.mapPurchaseOrder(order),
      purchaseOrderActions: this.buildPurchaseOrderActions(order),
    };
  }

  private mapAdminPurchaseOrderReevaluationResponse(
    order: PurchaseOrder,
    outcome: PurchaseOrderReevaluationOutcome,
  ): AdminPurchaseOrderReevaluationResponseDto {
    return {
      ...this.mapAdminPurchaseOrder(order),
      reevaluationOutcome: this.mapReevaluationOutcome(outcome),
    };
  }

  private mapPurchaseOrderListSummary(
    rawSummary: any,
  ): PurchaseOrderListSummaryResponseDto {
    return {
      totalPurchaseOrders: Number(rawSummary?.totalPurchaseOrders ?? 0),
      autoReplenishmentCount: Number(rawSummary?.autoReplenishmentCount ?? 0),
      autoSubmitDraftCount: Number(rawSummary?.autoSubmitDraftCount ?? 0),
      blockedAutoSubmitDraftCount: Number(
        rawSummary?.blockedAutoSubmitDraftCount ?? 0,
      ),
      readyAutoSubmitDraftCount: Number(
        rawSummary?.readyAutoSubmitDraftCount ?? 0,
      ),
      blockedReasonBreakdown: this.mapBlockedReasonBreakdown(rawSummary),
    };
  }

  private buildPurchaseOrderActions(
    order: PurchaseOrder,
  ): AdminPurchaseOrderActionResponseDto[] {
    if (
      order.status !== PurchaseOrderStatus.DRAFT ||
      order.statusMeta?.autoReplenishment !== true
    ) {
      return [];
    }

    return [
      {
        type: 'RE_EVALUATE_AUTO_REPLENISHMENT',
        method: 'PATCH',
        path: `/admin/b2b/purchase-orders/${order.id}/re-evaluate-auto-replenishment`,
        query: null,
        enabled: true,
      },
    ];
  }

  private mapReevaluationOutcome(
    outcome: PurchaseOrderReevaluationOutcome,
  ): PurchaseOrderReevaluationOutcomeResponseDto {
    return {
      previousStatus: outcome.previousStatus,
      nextStatus: outcome.nextStatus,
      previousBlockedReason: outcome.previousBlockedReason,
      nextBlockedReason: outcome.nextBlockedReason,
      actionTaken: outcome.actionTaken,
    };
  }

  private mapBlockedReasonBreakdown(
    rawSummary: any,
  ): PurchaseOrderBlockedReasonCountResponseDto[] {
    const entries: Array<{ reason: string; rawKey: string }> = [
      { reason: 'DAY_OF_WEEK_BLOCKED', rawKey: 'dayOfWeekBlockedCount' },
      {
        reason: 'HOUR_OUTSIDE_WINDOW',
        rawKey: 'hourOutsideWindowBlockedCount',
      },
      {
        reason: 'PREFERRED_SUPPLIER_REQUIRED',
        rawKey: 'preferredSupplierRequiredCount',
      },
      {
        reason: 'MINIMUM_ORDER_TOTAL_NOT_MET',
        rawKey: 'minimumOrderTotalNotMetCount',
      },
      {
        reason: 'AUTOMATION_NOT_ENTITLED',
        rawKey: 'automationNotEntitledCount',
      },
    ];

    return entries
      .map((entry) => ({
        reason: entry.reason,
        count: Number(rawSummary?.[entry.rawKey] ?? 0),
      }))
      .filter((entry) => entry.count > 0);
  }

  private mapAutoReplenishmentStatus(
    statusMeta?: Record<string, any> | null,
  ): PurchaseOrderAutoReplenishmentStatusResponseDto | null {
    if (statusMeta?.autoReplenishment !== true) {
      return null;
    }

    return {
      isAutoReplenishment: true,
      submissionMode: statusMeta.autoReplenishmentSubmissionMode ?? null,
      lastAttemptEligible:
        typeof statusMeta.lastAutoSubmissionAttempt?.eligible === 'boolean'
          ? statusMeta.lastAutoSubmissionAttempt.eligible
          : null,
      lastAttemptBlockedReason:
        statusMeta.lastAutoSubmissionAttempt?.blockedReason ?? null,
      lastAttemptAt: statusMeta.lastAutoSubmissionAttempt?.at ?? null,
      preferredSupplierProfileId:
        statusMeta.autoReplenishmentPreferredSupplierProfileId ?? null,
      minimumOrderTotal: statusMeta.autoReplenishmentMinimumOrderTotal ?? null,
      orderWindow: statusMeta.autoReplenishmentOrderWindow ?? null,
    };
  }

  private mapBranchTransfer(
    transfer: BranchTransfer,
  ): BranchTransferResponseDto {
    return {
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      fromBranchId: transfer.fromBranchId,
      toBranchId: transfer.toBranchId,
      status: transfer.status,
      note: transfer.note ?? null,
      requestedByUserId: transfer.requestedByUserId ?? null,
      requestedAt: transfer.requestedAt ?? null,
      dispatchedByUserId: transfer.dispatchedByUserId ?? null,
      dispatchedAt: transfer.dispatchedAt ?? null,
      receivedByUserId: transfer.receivedByUserId ?? null,
      receivedAt: transfer.receivedAt ?? null,
      cancelledByUserId: transfer.cancelledByUserId ?? null,
      cancelledAt: transfer.cancelledAt ?? null,
      items: (transfer.items ?? []).map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        note: item.note ?? null,
      })),
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
    };
  }
}
