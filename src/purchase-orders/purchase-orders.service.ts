import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../auth/roles.enum';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { ReplenishmentService } from '../branches/replenishment.service';
import { Branch } from '../branches/entities/branch.entity';
import { StockMovementType } from '../branches/entities/stock-movement.entity';
import { Product } from '../products/entities/product.entity';
import { SupplierOffer } from '../supplier-offers/entities/supplier-offer.entity';
import {
  SupplierOnboardingStatus,
  SupplierProfile,
} from '../suppliers/entities/supplier-profile.entity';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ApprovePurchaseOrderReceiptDiscrepancyDto } from './dto/approve-purchase-order-receipt-discrepancy.dto';
import { AcknowledgePurchaseOrderReceiptDto } from './dto/acknowledge-purchase-order-receipt.dto';
import { RecordPurchaseOrderReceiptDto } from './dto/record-purchase-order-receipt.dto';
import { ResolvePurchaseOrderReceiptDiscrepancyDto } from './dto/resolve-purchase-order-receipt-discrepancy.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { ForceClosePurchaseOrderReceiptDiscrepancyDto } from '../admin/dto/force-close-purchase-order-receipt-discrepancy.dto';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from './entities/purchase-order.entity';
import {
  PurchaseOrderReceiptDiscrepancyStatus,
  PurchaseOrderReceiptEvent,
} from './entities/purchase-order-receipt-event.entity';

type ReceiptLineSummary = {
  itemId: number;
  productId: number;
  receivedQuantity: number;
  shortageQuantity: number;
  damagedQuantity: number;
  note?: string | null;
};

const PURCHASE_ORDER_TRANSITIONS: Record<
  PurchaseOrderStatus,
  PurchaseOrderStatus[]
> = {
  [PurchaseOrderStatus.DRAFT]: [
    PurchaseOrderStatus.SUBMITTED,
    PurchaseOrderStatus.CANCELLED,
  ],
  [PurchaseOrderStatus.SUBMITTED]: [
    PurchaseOrderStatus.ACKNOWLEDGED,
    PurchaseOrderStatus.CANCELLED,
  ],
  [PurchaseOrderStatus.ACKNOWLEDGED]: [
    PurchaseOrderStatus.SHIPPED,
    PurchaseOrderStatus.CANCELLED,
  ],
  [PurchaseOrderStatus.SHIPPED]: [PurchaseOrderStatus.RECEIVED],
  [PurchaseOrderStatus.RECEIVED]: [PurchaseOrderStatus.RECONCILED],
  [PurchaseOrderStatus.RECONCILED]: [],
  [PurchaseOrderStatus.CANCELLED]: [],
};

export type PurchaseOrderReevaluationOutcome = {
  previousStatus: PurchaseOrderStatus;
  nextStatus: PurchaseOrderStatus;
  previousBlockedReason: string | null;
  nextBlockedReason: string | null;
  actionTaken: 'SUBMITTED' | 'REMAINED_DRAFT';
};

export type PurchaseOrderReevaluationResult = {
  purchaseOrder: PurchaseOrder;
  outcome: PurchaseOrderReevaluationOutcome;
};

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepository: Repository<PurchaseOrder>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(SupplierProfile)
    private readonly supplierProfilesRepository: Repository<SupplierProfile>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(SupplierOffer)
    private readonly supplierOffersRepository: Repository<SupplierOffer>,
    @InjectRepository(PurchaseOrderReceiptEvent)
    private readonly purchaseOrderReceiptEventsRepository: Repository<PurchaseOrderReceiptEvent>,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => InventoryLedgerService))
    private readonly inventoryLedgerService: InventoryLedgerService,
    @Inject(forwardRef(() => ReplenishmentService))
    private readonly replenishmentService: ReplenishmentService,
  ) {}

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    const branch = await this.branchesRepository.findOne({
      where: { id: dto.branchId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${dto.branchId} not found`);
    }

    const supplierProfile = await this.supplierProfilesRepository.findOne({
      where: { id: dto.supplierProfileId },
    });
    if (!supplierProfile) {
      throw new NotFoundException(
        `Supplier profile with ID ${dto.supplierProfileId} not found`,
      );
    }
    if (
      supplierProfile.onboardingStatus !== SupplierOnboardingStatus.APPROVED
    ) {
      throw new BadRequestException(
        'Purchase orders can only target approved supplier profiles',
      );
    }

    const subtotal = dto.items.reduce(
      (sum, item) => sum + item.orderedQuantity * item.unitPrice,
      0,
    );

    for (const item of dto.items) {
      const product = await this.productsRepository.findOne({
        where: { id: item.productId },
      });
      if (!product) {
        throw new NotFoundException(
          `Product with ID ${item.productId} not found`,
        );
      }

      if (item.supplierOfferId != null) {
        const supplierOffer = await this.supplierOffersRepository.findOne({
          where: { id: item.supplierOfferId },
        });
        if (!supplierOffer) {
          throw new NotFoundException(
            `Supplier offer with ID ${item.supplierOfferId} not found`,
          );
        }
        if (supplierOffer.supplierProfileId !== dto.supplierProfileId) {
          throw new BadRequestException(
            `Supplier offer ${item.supplierOfferId} does not belong to supplier profile ${dto.supplierProfileId}`,
          );
        }
        if (supplierOffer.productId !== item.productId) {
          throw new BadRequestException(
            `Supplier offer ${item.supplierOfferId} does not match product ${item.productId}`,
          );
        }
      }
    }

    const purchaseOrder = this.purchaseOrdersRepository.create({
      branchId: dto.branchId,
      supplierProfileId: dto.supplierProfileId,
      currency: dto.currency ?? 'USD',
      expectedDeliveryDate: dto.expectedDeliveryDate,
      orderNumber: `PO-${Date.now()}`,
      status: PurchaseOrderStatus.DRAFT,
      subtotal,
      total: subtotal,
      statusMeta: {},
      items: dto.items.map(
        (item) =>
          ({
            productId: item.productId,
            supplierOfferId: item.supplierOfferId,
            orderedQuantity: item.orderedQuantity,
            unitPrice: item.unitPrice,
          }) as PurchaseOrderItem,
      ),
    });

    await this.purchaseOrdersRepository.save(purchaseOrder);
    return this.findOneById(purchaseOrder.id);
  }

  async findAll(): Promise<PurchaseOrder[]> {
    return this.purchaseOrdersRepository.find({
      order: { createdAt: 'DESC' },
      relations: {
        branch: true,
        supplierProfile: true,
        items: { product: true, supplierOffer: true },
      },
    });
  }

  async listReceiptEvents(id: number): Promise<PurchaseOrderReceiptEvent[]> {
    await this.findOneById(id);
    return this.purchaseOrderReceiptEventsRepository.find({
      where: { purchaseOrderId: id },
      order: { createdAt: 'DESC' },
    });
  }

  async recordReceiptEvent(
    id: number,
    dto: RecordPurchaseOrderReceiptDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findOneById(id);
    const previousInboundProjection =
      this.buildInboundOpenPoProjection(purchaseOrder);
    const roles = actor.roles ?? [];

    if (
      ![PurchaseOrderStatus.SHIPPED, PurchaseOrderStatus.RECEIVED].includes(
        purchaseOrder.status,
      )
    ) {
      throw new BadRequestException(
        'Receipt events can only be recorded for shipped or received purchase orders',
      );
    }

    this.assertRoleAllowedForStatus(PurchaseOrderStatus.RECEIVED, roles);

    const now = new Date();
    const receiptSummary = this.applyReceiptSideEffects(
      purchaseOrder,
      dto,
      now,
      true,
    );

    if (purchaseOrder.status !== PurchaseOrderStatus.RECEIVED) {
      purchaseOrder.status = PurchaseOrderStatus.RECEIVED;
    }
    if (!purchaseOrder.receivedAt) {
      purchaseOrder.receivedAt = now;
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(PurchaseOrder).save(purchaseOrder);
      await this.syncInboundOpenPoProjection(
        purchaseOrder,
        previousInboundProjection,
        manager,
      );
      await this.persistReceiptSideEffects(
        purchaseOrder,
        receiptSummary,
        actor.id ?? null,
        dto.reason,
        manager,
      );
      await this.persistReceiptEvent(
        purchaseOrder,
        receiptSummary,
        actor.id ?? null,
        dto.reason,
        dto.metadata ?? null,
        manager,
      );
      await this.auditService.log(
        {
          action: 'purchase_order.receipt.recorded',
          targetType: 'PURCHASE_ORDER',
          targetId: id,
          actorId: actor.id ?? null,
          actorEmail: actor.email ?? null,
          reason: dto.reason ?? null,
          meta: {
            receiptLines: receiptSummary,
            metadata: dto.metadata ?? null,
          },
        },
        manager,
      );
    });

    return this.findOneById(id);
  }

  async acknowledgeReceiptEvent(
    purchaseOrderId: number,
    eventId: number,
    dto: AcknowledgePurchaseOrderReceiptDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<PurchaseOrderReceiptEvent> {
    this.assertSupplierReceiptRole(actor.roles ?? []);

    const receiptEvent = await this.findReceiptEventOrThrow(
      purchaseOrderId,
      eventId,
    );
    if (receiptEvent.supplierAcknowledgedAt) {
      return receiptEvent;
    }

    receiptEvent.supplierAcknowledgedAt = new Date();
    receiptEvent.supplierAcknowledgedByUserId = actor.id ?? null;
    receiptEvent.supplierAcknowledgementNote = dto.note ?? null;

    const savedEvent =
      await this.purchaseOrderReceiptEventsRepository.save(receiptEvent);
    await this.auditService.log({
      action: 'purchase_order.receipt.acknowledged',
      targetType: 'PURCHASE_ORDER_RECEIPT_EVENT',
      targetId: eventId,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto.note ?? null,
      meta: {
        purchaseOrderId,
      },
    });

    return savedEvent;
  }

  async resolveReceiptEventDiscrepancy(
    purchaseOrderId: number,
    eventId: number,
    dto: ResolvePurchaseOrderReceiptDiscrepancyDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<PurchaseOrderReceiptEvent> {
    this.assertSupplierReceiptRole(actor.roles ?? []);

    const receiptEvent = await this.findReceiptEventOrThrow(
      purchaseOrderId,
      eventId,
    );
    if (!this.hasReceiptDiscrepancy(receiptEvent)) {
      throw new BadRequestException(
        'This receipt event does not contain a shortage or damaged quantity to resolve',
      );
    }

    receiptEvent.discrepancyStatus =
      PurchaseOrderReceiptDiscrepancyStatus.RESOLVED;
    receiptEvent.discrepancyResolutionNote = dto.resolutionNote;
    receiptEvent.discrepancyMetadata = dto.metadata ?? null;
    receiptEvent.discrepancyResolvedAt = new Date();
    receiptEvent.discrepancyResolvedByUserId = actor.id ?? null;

    const savedEvent =
      await this.purchaseOrderReceiptEventsRepository.save(receiptEvent);
    await this.auditService.log({
      action: 'purchase_order.receipt.discrepancy_resolved',
      targetType: 'PURCHASE_ORDER_RECEIPT_EVENT',
      targetId: eventId,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto.resolutionNote,
      meta: {
        purchaseOrderId,
        metadata: dto.metadata ?? null,
      },
    });

    return savedEvent;
  }

  async approveReceiptEventDiscrepancy(
    purchaseOrderId: number,
    eventId: number,
    dto: ApprovePurchaseOrderReceiptDiscrepancyDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<PurchaseOrderReceiptEvent> {
    this.assertBuyerReceiptApprovalRole(actor.roles ?? []);

    const receiptEvent = await this.findReceiptEventOrThrow(
      purchaseOrderId,
      eventId,
    );
    if (
      receiptEvent.discrepancyStatus !==
      PurchaseOrderReceiptDiscrepancyStatus.RESOLVED
    ) {
      throw new BadRequestException(
        'Only resolved receipt discrepancies can be approved',
      );
    }

    receiptEvent.discrepancyStatus =
      PurchaseOrderReceiptDiscrepancyStatus.APPROVED;
    receiptEvent.discrepancyApprovedAt = new Date();
    receiptEvent.discrepancyApprovedByUserId = actor.id ?? null;
    receiptEvent.discrepancyApprovalNote = dto.note ?? null;

    const savedEvent =
      await this.purchaseOrderReceiptEventsRepository.save(receiptEvent);
    await this.auditService.log({
      action: 'purchase_order.receipt.discrepancy_approved',
      targetType: 'PURCHASE_ORDER_RECEIPT_EVENT',
      targetId: eventId,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto.note ?? null,
      meta: {
        purchaseOrderId,
      },
    });

    return savedEvent;
  }

  async forceCloseReceiptEventDiscrepancy(
    purchaseOrderId: number,
    eventId: number,
    dto: ForceClosePurchaseOrderReceiptDiscrepancyDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<PurchaseOrderReceiptEvent> {
    this.assertAdminReceiptOverrideRole(actor.roles ?? []);

    const receiptEvent = await this.findReceiptEventOrThrow(
      purchaseOrderId,
      eventId,
    );
    if (!this.hasReceiptDiscrepancy(receiptEvent)) {
      throw new BadRequestException(
        'This receipt event does not contain a shortage or damaged quantity to force-close',
      );
    }

    if (
      receiptEvent.discrepancyStatus ===
      PurchaseOrderReceiptDiscrepancyStatus.APPROVED
    ) {
      return receiptEvent;
    }

    const previousDiscrepancyStatus = receiptEvent.discrepancyStatus ?? null;
    receiptEvent.discrepancyStatus =
      PurchaseOrderReceiptDiscrepancyStatus.APPROVED;
    receiptEvent.discrepancyApprovedAt = new Date();
    receiptEvent.discrepancyApprovedByUserId = actor.id ?? null;
    receiptEvent.discrepancyApprovalNote = dto.note;

    const savedEvent =
      await this.purchaseOrderReceiptEventsRepository.save(receiptEvent);
    await this.auditService.log({
      action: 'purchase_order.receipt.discrepancy_force_closed',
      targetType: 'PURCHASE_ORDER_RECEIPT_EVENT',
      targetId: eventId,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto.note,
      meta: {
        purchaseOrderId,
        previousDiscrepancyStatus,
        nextDiscrepancyStatus: PurchaseOrderReceiptDiscrepancyStatus.APPROVED,
      },
    });

    return savedEvent;
  }

  async updateStatus(
    id: number,
    dto: UpdatePurchaseOrderStatusDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findOneById(id);
    return this.updateLoadedStatus(purchaseOrder, dto, actor);
  }

  async updateStatusWithManager(
    id: number,
    dto: UpdatePurchaseOrderStatusDto,
    manager: EntityManager,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findOneByIdUsingRepository(
      manager.getRepository(PurchaseOrder),
      id,
    );
    return this.updateLoadedStatus(purchaseOrder, dto, actor, manager);
  }

  async reevaluateAutoReplenishmentDraft(
    id: number,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<PurchaseOrder> {
    const result = await this.reevaluateAutoReplenishmentDraftDetailed(
      id,
      actor,
    );
    return result.purchaseOrder;
  }

  async reevaluateAutoReplenishmentDraftDetailed(
    id: number,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<PurchaseOrderReevaluationResult> {
    const purchaseOrder = await this.findOneById(id);

    if (purchaseOrder.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft purchase orders can be re-evaluated for auto-replenishment submission',
      );
    }

    if (purchaseOrder.statusMeta?.autoReplenishment !== true) {
      throw new BadRequestException(
        'Only auto-replenishment drafts can be re-evaluated',
      );
    }

    const previousStatus = purchaseOrder.status;
    const previousBlockedReason =
      purchaseOrder.statusMeta?.lastAutoSubmissionAttempt?.blockedReason ??
      null;
    const reevaluated =
      await this.replenishmentService.reevaluateDraftPurchaseOrder(
        purchaseOrder,
        actor.id ?? null,
      );
    const outcome: PurchaseOrderReevaluationOutcome = {
      previousStatus,
      nextStatus: reevaluated.status,
      previousBlockedReason,
      nextBlockedReason:
        reevaluated.statusMeta?.lastAutoSubmissionAttempt?.blockedReason ??
        null,
      actionTaken:
        reevaluated.status !== previousStatus ? 'SUBMITTED' : 'REMAINED_DRAFT',
    };

    await this.auditService.log({
      action: 'purchase_order.auto_replenishment.re_evaluated',
      targetType: 'PURCHASE_ORDER',
      targetId: id,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      meta: {
        ...outcome,
        submissionMode:
          reevaluated.statusMeta?.autoReplenishmentSubmissionMode ?? null,
      },
    });

    return {
      purchaseOrder: reevaluated,
      outcome,
    };
  }

  private async updateLoadedStatus(
    purchaseOrder: PurchaseOrder,
    dto: UpdatePurchaseOrderStatusDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
    manager?: EntityManager,
  ): Promise<PurchaseOrder> {
    const nextStatus = dto.status;
    const roles = actor.roles ?? [];
    const previousStatus = purchaseOrder.status;
    const previousInboundProjection =
      this.buildInboundOpenPoProjection(purchaseOrder);
    const id = purchaseOrder.id;

    if (purchaseOrder.status === nextStatus) {
      return manager
        ? this.findOneByIdUsingRepository(
            manager.getRepository(PurchaseOrder),
            id,
          )
        : purchaseOrder;
    }

    const allowedTransitions =
      PURCHASE_ORDER_TRANSITIONS[purchaseOrder.status] ?? [];
    if (!allowedTransitions.includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid purchase order transition from ${purchaseOrder.status} to ${nextStatus}`,
      );
    }

    this.assertRoleAllowedForStatus(nextStatus, roles);

    if (nextStatus === PurchaseOrderStatus.RECONCILED) {
      await this.assertReadyForReconciliation(purchaseOrder, manager);
    }

    purchaseOrder.status = nextStatus;
    purchaseOrder.statusMeta = {
      ...(purchaseOrder.statusMeta ?? {}),
      lastTransition: {
        fromStatus: previousStatus,
        toStatus: nextStatus,
        actorId: actor.id ?? null,
        actorEmail: actor.email ?? null,
        reason: dto.reason ?? null,
        trackingReference: dto.trackingReference ?? null,
        metadata: dto.metadata ?? null,
        changedAt: new Date().toISOString(),
      },
    };
    this.applyLifecycleSideEffects(purchaseOrder, nextStatus, dto);
    const persistStatusUpdate = async (transactionManager: EntityManager) => {
      await transactionManager.getRepository(PurchaseOrder).save(purchaseOrder);
      await this.syncInboundOpenPoProjection(
        purchaseOrder,
        previousInboundProjection,
        transactionManager,
      );
      if (nextStatus === PurchaseOrderStatus.RECEIVED) {
        const receiptSummary =
          (purchaseOrder.statusMeta?.latestReceipt
            ?.items as ReceiptLineSummary[]) ?? [];
        await this.persistReceiptSideEffects(
          purchaseOrder,
          receiptSummary,
          actor.id ?? null,
          dto.reason,
          transactionManager,
        );
        await this.persistReceiptEvent(
          purchaseOrder,
          receiptSummary,
          actor.id ?? null,
          dto.reason,
          dto.metadata ?? null,
          transactionManager,
        );
      }
      await this.auditService.log(
        {
          action: 'purchase_order.status.update',
          targetType: 'PURCHASE_ORDER',
          targetId: id,
          actorId: actor.id ?? null,
          actorEmail: actor.email ?? null,
          reason: dto.reason ?? null,
          meta: {
            fromStatus: previousStatus,
            toStatus: nextStatus,
            trackingReference: dto.trackingReference ?? null,
            metadata: dto.metadata ?? null,
          },
        },
        transactionManager,
      );
    };

    if (manager) {
      await persistStatusUpdate(manager);
      return this.findOneByIdUsingRepository(
        manager.getRepository(PurchaseOrder),
        id,
      );
    }

    await this.dataSource.transaction(persistStatusUpdate);
    return this.findOneById(id);
  }

  private applyLifecycleSideEffects(
    purchaseOrder: PurchaseOrder,
    status: PurchaseOrderStatus,
    dto: UpdatePurchaseOrderStatusDto,
  ): void {
    const now = new Date();

    if (
      status === PurchaseOrderStatus.SUBMITTED &&
      !purchaseOrder.submittedAt
    ) {
      purchaseOrder.submittedAt = now;
    }

    if (
      status === PurchaseOrderStatus.ACKNOWLEDGED &&
      !purchaseOrder.acknowledgedAt
    ) {
      purchaseOrder.acknowledgedAt = now;
    }

    if (status === PurchaseOrderStatus.SHIPPED && !purchaseOrder.shippedAt) {
      purchaseOrder.shippedAt = now;
      purchaseOrder.statusMeta = {
        ...(purchaseOrder.statusMeta ?? {}),
        shipping: {
          trackingReference: dto.trackingReference ?? null,
          shippedAt: now.toISOString(),
        },
      };
    }

    if (status === PurchaseOrderStatus.RECEIVED && !purchaseOrder.receivedAt) {
      purchaseOrder.receivedAt = now;
      this.applyReceiptSideEffects(purchaseOrder, dto, now, false);
    }

    if (
      status === PurchaseOrderStatus.RECONCILED &&
      !purchaseOrder.reconciledAt
    ) {
      purchaseOrder.reconciledAt = now;
    }

    if (
      status === PurchaseOrderStatus.CANCELLED &&
      !purchaseOrder.cancelledAt
    ) {
      purchaseOrder.cancelledAt = now;
    }
  }

  private applyReceiptSideEffects(
    purchaseOrder: PurchaseOrder,
    dto: Pick<
      UpdatePurchaseOrderStatusDto,
      'receiptLines' | 'reason' | 'metadata'
    >,
    now: Date,
    incremental: boolean,
  ): ReceiptLineSummary[] {
    const receiptLinesByItemId = new Map(
      (dto.receiptLines ?? []).map((line) => [line.itemId, line]),
    );

    const receiptSummary = purchaseOrder.items.map((item) => {
      const receiptLine = receiptLinesByItemId.get(item.id);
      const outstandingQuantity = Math.max(
        item.orderedQuantity -
          item.receivedQuantity -
          item.shortageQuantity -
          item.damagedQuantity,
        0,
      );
      const receivedQuantity = receiptLine
        ? receiptLine.receivedQuantity
        : outstandingQuantity;
      const shortageQuantity = receiptLine?.shortageQuantity ?? 0;
      const damagedQuantity = receiptLine?.damagedQuantity ?? 0;

      const cumulativeReceived = incremental
        ? item.receivedQuantity + receivedQuantity
        : receivedQuantity;
      const cumulativeShortage = incremental
        ? item.shortageQuantity + shortageQuantity
        : shortageQuantity;
      const cumulativeDamaged = incremental
        ? item.damagedQuantity + damagedQuantity
        : damagedQuantity;

      if (
        cumulativeReceived + cumulativeShortage + cumulativeDamaged >
        item.orderedQuantity
      ) {
        throw new BadRequestException(
          `Receipt totals exceed ordered quantity for purchase order item ${item.id}`,
        );
      }

      item.receivedQuantity = cumulativeReceived;
      item.shortageQuantity = cumulativeShortage;
      item.damagedQuantity = cumulativeDamaged;
      item.note = receiptLine?.note ?? item.note ?? null;
      return {
        itemId: item.id,
        productId: item.productId,
        receivedQuantity,
        shortageQuantity,
        damagedQuantity,
        note: item.note ?? null,
      };
    });

    purchaseOrder.statusMeta = {
      ...(purchaseOrder.statusMeta ?? {}),
      latestReceipt: {
        receivedAt: now.toISOString(),
        note: dto.reason ?? null,
        items: receiptSummary,
        metadata: dto.metadata ?? null,
      },
    };

    return receiptSummary;
  }

  private async persistReceiptSideEffects(
    purchaseOrder: PurchaseOrder,
    receiptSummary: ReceiptLineSummary[],
    actorId?: number | null,
    reason?: string,
    manager?: EntityManager,
  ): Promise<void> {
    for (const line of receiptSummary) {
      if (line.receivedQuantity <= 0) {
        continue;
      }

      await this.inventoryLedgerService.recordMovement(
        {
          branchId: purchaseOrder.branchId,
          productId: line.productId,
          movementType: StockMovementType.PURCHASE_RECEIPT,
          quantityDelta: line.receivedQuantity,
          sourceType: 'PURCHASE_ORDER',
          sourceReferenceId: purchaseOrder.id,
          actorUserId: actorId ?? null,
          note: line.note ?? reason ?? null,
          occurredAt: purchaseOrder.receivedAt ?? new Date(),
          lastPurchaseOrderId: purchaseOrder.id,
        },
        manager,
      );
    }
  }

  private buildInboundOpenPoProjection(
    purchaseOrder: PurchaseOrder,
  ): Map<number, number> {
    const activeStatuses = new Set<PurchaseOrderStatus>([
      PurchaseOrderStatus.SUBMITTED,
      PurchaseOrderStatus.ACKNOWLEDGED,
      PurchaseOrderStatus.SHIPPED,
      PurchaseOrderStatus.RECEIVED,
    ]);

    if (!activeStatuses.has(purchaseOrder.status)) {
      return new Map();
    }

    return purchaseOrder.items.reduce((projection, item) => {
      const outstandingQuantity = Math.max(
        item.orderedQuantity -
          item.receivedQuantity -
          item.shortageQuantity -
          item.damagedQuantity,
        0,
      );

      if (outstandingQuantity <= 0) {
        return projection;
      }

      projection.set(
        item.productId,
        (projection.get(item.productId) ?? 0) + outstandingQuantity,
      );
      return projection;
    }, new Map<number, number>());
  }

  private async syncInboundOpenPoProjection(
    purchaseOrder: PurchaseOrder,
    previousProjection: Map<number, number>,
    manager?: EntityManager,
  ): Promise<void> {
    const nextProjection = this.buildInboundOpenPoProjection(purchaseOrder);
    const productIds = new Set<number>([
      ...previousProjection.keys(),
      ...nextProjection.keys(),
    ]);

    for (const productId of productIds) {
      const delta =
        (nextProjection.get(productId) ?? 0) -
        (previousProjection.get(productId) ?? 0);

      if (delta === 0) {
        continue;
      }

      await this.inventoryLedgerService.adjustInboundOpenPo(
        {
          branchId: purchaseOrder.branchId,
          productId,
          quantityDelta: delta,
        },
        manager,
      );
    }
  }

  private async persistReceiptEvent(
    purchaseOrder: PurchaseOrder,
    receiptSummary: ReceiptLineSummary[],
    actorId?: number | null,
    reason?: string,
    metadata?: Record<string, any> | null,
    manager?: EntityManager,
  ): Promise<void> {
    const receiptEventsRepository =
      manager?.getRepository(PurchaseOrderReceiptEvent) ??
      this.purchaseOrderReceiptEventsRepository;

    await receiptEventsRepository.save(
      receiptEventsRepository.create({
        purchaseOrderId: purchaseOrder.id,
        actorUserId: actorId ?? null,
        note: reason ?? null,
        receiptLines: receiptSummary,
        metadata: metadata ?? null,
        discrepancyStatus: receiptSummary.some(
          (line) => line.shortageQuantity > 0 || line.damagedQuantity > 0,
        )
          ? PurchaseOrderReceiptDiscrepancyStatus.OPEN
          : null,
      }),
    );
  }

  private async findOneById(id: number): Promise<PurchaseOrder> {
    return this.findOneByIdUsingRepository(this.purchaseOrdersRepository, id);
  }

  private async findOneByIdUsingRepository(
    repository: Repository<PurchaseOrder>,
    id: number,
  ): Promise<PurchaseOrder> {
    const purchaseOrder = await repository.findOne({
      where: { id },
      relations: {
        branch: true,
        supplierProfile: true,
        items: { product: true, supplierOffer: true },
      },
    });

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    return purchaseOrder;
  }

  private async findReceiptEventOrThrow(
    purchaseOrderId: number,
    eventId: number,
  ): Promise<PurchaseOrderReceiptEvent> {
    const receiptEvent =
      await this.purchaseOrderReceiptEventsRepository.findOne({
        where: { id: eventId, purchaseOrderId },
      });

    if (!receiptEvent) {
      throw new NotFoundException(
        `Receipt event ${eventId} for purchase order ${purchaseOrderId} not found`,
      );
    }

    return receiptEvent;
  }

  private async assertReadyForReconciliation(
    purchaseOrder: PurchaseOrder,
    manager?: EntityManager,
  ): Promise<void> {
    const hasOutstandingReceiptAccounting = purchaseOrder.items.some(
      (item) =>
        item.receivedQuantity + item.shortageQuantity + item.damagedQuantity !==
        item.orderedQuantity,
    );

    if (hasOutstandingReceiptAccounting) {
      throw new BadRequestException(
        'Purchase order cannot be reconciled until every item quantity is fully accounted for',
      );
    }

    const receiptEventsRepository =
      manager?.getRepository(PurchaseOrderReceiptEvent) ??
      this.purchaseOrderReceiptEventsRepository;

    const discrepantEvents = await receiptEventsRepository.find({
      where: { purchaseOrderId: purchaseOrder.id },
      order: { createdAt: 'DESC' },
    });

    const blockingDiscrepancy = discrepantEvents.find(
      (event) =>
        event.discrepancyStatus ===
          PurchaseOrderReceiptDiscrepancyStatus.OPEN ||
        event.discrepancyStatus ===
          PurchaseOrderReceiptDiscrepancyStatus.RESOLVED,
    );

    if (blockingDiscrepancy) {
      throw new BadRequestException(
        'Purchase order cannot be reconciled while receipt discrepancies are still open or awaiting approval',
      );
    }
  }

  private assertRoleAllowedForStatus(
    targetStatus: PurchaseOrderStatus,
    roles: string[],
  ): void {
    if (this.hasAnyRole(roles, [UserRole.SUPER_ADMIN, UserRole.ADMIN])) {
      return;
    }

    const buyerRoles = [UserRole.POS_MANAGER, UserRole.B2B_BUYER];
    const supplierRoles = [UserRole.SUPPLIER_ACCOUNT];

    if (
      [
        PurchaseOrderStatus.SUBMITTED,
        PurchaseOrderStatus.RECEIVED,
        PurchaseOrderStatus.RECONCILED,
      ].includes(targetStatus) &&
      this.hasAnyRole(roles, buyerRoles)
    ) {
      return;
    }

    if (
      [PurchaseOrderStatus.ACKNOWLEDGED, PurchaseOrderStatus.SHIPPED].includes(
        targetStatus,
      ) &&
      this.hasAnyRole(roles, supplierRoles)
    ) {
      return;
    }

    if (
      targetStatus === PurchaseOrderStatus.CANCELLED &&
      this.hasAnyRole(roles, [...buyerRoles, ...supplierRoles])
    ) {
      return;
    }

    throw new ForbiddenException(
      `Your role is not allowed to move purchase orders to ${targetStatus}`,
    );
  }

  private assertSupplierReceiptRole(roles: string[]): void {
    if (
      this.hasAnyRole(roles, [
        UserRole.SUPPLIER_ACCOUNT,
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
      ])
    ) {
      return;
    }

    throw new ForbiddenException(
      'Your role is not allowed to manage supplier receipt acknowledgements or discrepancy resolutions',
    );
  }

  private assertBuyerReceiptApprovalRole(roles: string[]): void {
    if (
      this.hasAnyRole(roles, [
        UserRole.POS_MANAGER,
        UserRole.B2B_BUYER,
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
      ])
    ) {
      return;
    }

    throw new ForbiddenException(
      'Your role is not allowed to approve supplier discrepancy resolutions',
    );
  }

  private assertAdminReceiptOverrideRole(roles: string[]): void {
    if (this.hasAnyRole(roles, [UserRole.SUPER_ADMIN, UserRole.ADMIN])) {
      return;
    }

    throw new ForbiddenException(
      'Your role is not allowed to force-close receipt discrepancies',
    );
  }

  private hasReceiptDiscrepancy(event: PurchaseOrderReceiptEvent): boolean {
    return event.receiptLines.some(
      (line) => line.shortageQuantity > 0 || line.damagedQuantity > 0,
    );
  }

  private hasAnyRole(roles: string[], allowedRoles: UserRole[]): boolean {
    return allowedRoles.some((role) => roles.includes(role));
  }
}
