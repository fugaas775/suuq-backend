import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
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
import { ProcurementWebhookEventType } from '../procurement-webhooks/entities/procurement-webhook-subscription.entity';
import { ProcurementWebhooksService } from '../procurement-webhooks/procurement-webhooks.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  SupplierOffer,
  SupplierOfferStatus,
  SupplierAvailabilityStatus,
} from '../supplier-offers/entities/supplier-offer.entity';
import {
  SupplierOnboardingStatus,
  SupplierProfile,
} from '../suppliers/entities/supplier-profile.entity';
import { BrowseAvailableOffersQueryDto } from './dto/browse-available-offers-query.dto';
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

type PurchaseOrderScope = {
  branchId?: number;
};

type PurchaseOrderActorContext = {
  id?: number | null;
  email?: string | null;
  roles?: string[];
  branchId?: number;
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
  private readonly logger = new Logger(PurchaseOrdersService.name);

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
    private readonly procurementWebhooksService: ProcurementWebhooksService,
    private readonly realtimeGateway: RealtimeGateway,
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

  async findAll(scope: PurchaseOrderScope = {}): Promise<PurchaseOrder[]> {
    return this.purchaseOrdersRepository.find({
      where: scope.branchId ? { branchId: scope.branchId } : undefined,
      order: { createdAt: 'DESC' },
      relations: {
        branch: true,
        supplierProfile: true,
        items: { product: { images: true }, supplierOffer: true },
      },
    });
  }

  async findAvailableOffers(query: BrowseAvailableOffersQueryDto) {
    const limit = Math.max(1, Math.min(50, Number(query.limit ?? 10)));
    const orderColumn =
      query.sortBy === 'leadtime_asc'
        ? 'offer.leadTimeDays'
        : 'offer.unitWholesalePrice';

    const offers = await this.supplierOffersRepository
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.supplierProfile', 'supplierProfile')
      .leftJoinAndSelect('offer.product', 'product')
      .leftJoinAndSelect('product.images', 'productImages')
      .where('offer.productId = :productId', { productId: query.productId })
      .andWhere('offer.status = :status', {
        status: SupplierOfferStatus.PUBLISHED,
      })
      .andWhere('offer.availabilityStatus != :outOfStock', {
        outOfStock: SupplierAvailabilityStatus.OUT_OF_STOCK,
      })
      .andWhere('supplierProfile.onboardingStatus = :supplierStatus', {
        supplierStatus: SupplierOnboardingStatus.APPROVED,
      })
      .andWhere('supplierProfile.isActive = true')
      .orderBy(orderColumn, 'ASC')
      .addOrderBy('offer.leadTimeDays', 'ASC')
      .addOrderBy('offer.id', 'ASC')
      .take(limit)
      .getMany();

    return offers.map((offer) => {
      const product = offer.product as any;
      const sortedImages = Array.isArray(product?.images)
        ? [...product.images].sort(
            (a: any, b: any) =>
              (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0) ||
              (a?.id ?? 0) - (b?.id ?? 0),
          )
        : [];
      const primaryImage = sortedImages[0];
      const thumbnailUrl =
        primaryImage?.thumbnailSrc ||
        primaryImage?.src ||
        product?.imageUrl ||
        null;

      return {
        id: offer.id,
        supplierProfileId: offer.supplierProfileId,
        supplierName:
          offer.supplierProfile?.companyName ||
          offer.supplierProfile?.legalName ||
          `Supplier #${offer.supplierProfileId}`,
        productId: offer.productId,
        productName: product?.name || `Product #${offer.productId}`,
        productImageUrl: thumbnailUrl,
        unitWholesalePrice: Number(offer.unitWholesalePrice),
        currency: offer.currency,
        moq: offer.moq ?? 1,
        leadTimeDays: offer.leadTimeDays ?? 0,
        availabilityStatus: offer.availabilityStatus,
        fulfillmentRegions: offer.fulfillmentRegions ?? [],
      };
    });
  }

  async listReceiptEvents(
    id: number,
    scope: PurchaseOrderScope = {},
  ): Promise<PurchaseOrderReceiptEvent[]> {
    await this.findOneById(id, scope);
    return this.purchaseOrderReceiptEventsRepository.find({
      where: { purchaseOrderId: id },
      order: { createdAt: 'DESC' },
    });
  }

  async recordReceiptEvent(
    id: number,
    dto: RecordPurchaseOrderReceiptDto,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findOneById(id, {
      branchId: actor.branchId,
    });
    const previousStatus = purchaseOrder.status;
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

    const updatedPurchaseOrder = await this.findOneById(id);
    void this.dispatchProcurementPurchaseOrderFanout(updatedPurchaseOrder, {
      action: 'RECEIPT_RECORDED',
      previousStatus,
      currentStatus: updatedPurchaseOrder.status,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto.reason ?? null,
      metadata: dto.metadata ?? null,
      receiptSummary,
      trackingReference:
        (updatedPurchaseOrder.statusMeta?.shipping?.trackingReference as
          | string
          | null
          | undefined) ?? null,
    });

    return updatedPurchaseOrder;
  }

  async acknowledgeReceiptEvent(
    purchaseOrderId: number,
    eventId: number,
    dto: AcknowledgePurchaseOrderReceiptDto,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrderReceiptEvent> {
    this.assertReceiptAcknowledgementRole(actor.roles ?? []);

    const receiptEvent = await this.findReceiptEventOrThrow(
      purchaseOrderId,
      eventId,
      { branchId: actor.branchId },
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
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrderReceiptEvent> {
    this.assertReceiptAcknowledgementRole(actor.roles ?? []);

    const receiptEvent = await this.findReceiptEventOrThrow(
      purchaseOrderId,
      eventId,
      { branchId: actor.branchId },
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

    void this.dispatchProcurementReceiptDiscrepancyWebhookEvent(
      purchaseOrderId,
      savedEvent,
      {
        eventType: ProcurementWebhookEventType.RECEIPT_DISCREPANCY_RESOLVED,
        action: 'DISCREPANCY_RESOLVED',
        actorId: actor.id ?? null,
        actorEmail: actor.email ?? null,
        note: dto.resolutionNote,
        metadata: dto.metadata ?? null,
      },
    );

    return savedEvent;
  }

  async approveReceiptEventDiscrepancy(
    purchaseOrderId: number,
    eventId: number,
    dto: ApprovePurchaseOrderReceiptDiscrepancyDto,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrderReceiptEvent> {
    this.assertBuyerReceiptApprovalRole(actor.roles ?? []);

    const receiptEvent = await this.findReceiptEventOrThrow(
      purchaseOrderId,
      eventId,
      { branchId: actor.branchId },
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

    void this.dispatchProcurementReceiptDiscrepancyWebhookEvent(
      purchaseOrderId,
      savedEvent,
      {
        eventType: ProcurementWebhookEventType.RECEIPT_DISCREPANCY_APPROVED,
        action: 'DISCREPANCY_APPROVED',
        actorId: actor.id ?? null,
        actorEmail: actor.email ?? null,
        note: dto.note ?? null,
        metadata: savedEvent.discrepancyMetadata ?? null,
        approvalMode: 'STANDARD',
      },
    );

    return savedEvent;
  }

  async forceCloseReceiptEventDiscrepancy(
    purchaseOrderId: number,
    eventId: number,
    dto: ForceClosePurchaseOrderReceiptDiscrepancyDto,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrderReceiptEvent> {
    this.assertAdminReceiptOverrideRole(actor.roles ?? []);

    const receiptEvent = await this.findReceiptEventOrThrow(
      purchaseOrderId,
      eventId,
      { branchId: actor.branchId },
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

    void this.dispatchProcurementReceiptDiscrepancyWebhookEvent(
      purchaseOrderId,
      savedEvent,
      {
        eventType: ProcurementWebhookEventType.RECEIPT_DISCREPANCY_APPROVED,
        action: 'DISCREPANCY_APPROVED',
        actorId: actor.id ?? null,
        actorEmail: actor.email ?? null,
        note: dto.note,
        metadata: savedEvent.discrepancyMetadata ?? null,
        approvalMode: 'FORCE_CLOSE',
        previousDiscrepancyStatus,
      },
    );

    return savedEvent;
  }

  async updateStatus(
    id: number,
    dto: UpdatePurchaseOrderStatusDto,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findOneById(id, {
      branchId: actor.branchId,
    });
    const previousStatus = purchaseOrder.status;
    const updatedPurchaseOrder = await this.updateLoadedStatus(
      purchaseOrder,
      dto,
      actor,
    );

    void this.dispatchProcurementPurchaseOrderFanout(updatedPurchaseOrder, {
      action: 'STATUS_UPDATED',
      previousStatus,
      currentStatus: updatedPurchaseOrder.status,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto.reason ?? null,
      metadata: dto.metadata ?? null,
      trackingReference: dto.trackingReference ?? null,
      receiptSummary:
        dto.status === PurchaseOrderStatus.RECEIVED
          ? ((updatedPurchaseOrder.statusMeta?.latestReceipt?.items as
              | ReceiptLineSummary[]
              | undefined) ?? null)
          : null,
    });

    return updatedPurchaseOrder;
  }

  async updateStatusWithManager(
    id: number,
    dto: UpdatePurchaseOrderStatusDto,
    manager: EntityManager,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrder> {
    const purchaseOrder = await this.findOneByIdUsingRepository(
      manager.getRepository(PurchaseOrder),
      id,
      { branchId: actor.branchId },
    );
    return this.updateLoadedStatus(purchaseOrder, dto, actor, manager);
  }

  async reevaluateAutoReplenishmentDraft(
    id: number,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrder> {
    const result = await this.reevaluateAutoReplenishmentDraftDetailed(
      id,
      actor,
    );
    return result.purchaseOrder;
  }

  async reevaluateAutoReplenishmentDraftDetailed(
    id: number,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrderReevaluationResult> {
    const purchaseOrder = await this.findOneById(id, {
      branchId: actor.branchId,
    });

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

  private async findOneById(
    id: number,
    scope: PurchaseOrderScope = {},
  ): Promise<PurchaseOrder> {
    return this.findOneByIdUsingRepository(
      this.purchaseOrdersRepository,
      id,
      scope,
    );
  }

  private async findOneByIdUsingRepository(
    repository: Repository<PurchaseOrder>,
    id: number,
    scope: PurchaseOrderScope = {},
  ): Promise<PurchaseOrder> {
    const purchaseOrder = await repository.findOne({
      where: scope.branchId ? { id, branchId: scope.branchId } : { id },
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
    scope: PurchaseOrderScope = {},
  ): Promise<PurchaseOrderReceiptEvent> {
    await this.findOneById(purchaseOrderId, scope);

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

  private assertReceiptAcknowledgementRole(roles: string[]): void {
    if (
      this.hasAnyRole(roles, [
        UserRole.SUPPLIER_ACCOUNT,
        UserRole.POS_MANAGER,
        UserRole.B2B_BUYER,
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
      ])
    ) {
      return;
    }

    throw new ForbiddenException(
      'Your role is not allowed to manage receipt acknowledgements or discrepancy resolutions',
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

  private async dispatchProcurementPurchaseOrderFanout(
    purchaseOrder: PurchaseOrder,
    payload: {
      action: 'STATUS_UPDATED' | 'RECEIPT_RECORDED';
      previousStatus: PurchaseOrderStatus | null;
      currentStatus: PurchaseOrderStatus;
      actorId: number | null;
      actorEmail: string | null;
      reason: string | null;
      trackingReference?: string | null;
      metadata?: Record<string, any> | null;
      receiptSummary?: ReceiptLineSummary[] | null;
    },
  ): Promise<void> {
    try {
      void this.realtimeGateway.notifyProcurementPurchaseOrderUpdated({
        purchaseOrderId: purchaseOrder.id,
        branchId: purchaseOrder.branchId,
        supplierProfileId: purchaseOrder.supplierProfileId,
        action: payload.action,
        previousStatus: payload.previousStatus,
        currentStatus: payload.currentStatus,
        actorId: payload.actorId,
        actorEmail: payload.actorEmail,
        reason: payload.reason,
        trackingReference: payload.trackingReference ?? null,
        occurredAt: new Date().toISOString(),
        metadata: payload.metadata ?? null,
        receiptSummary: payload.receiptSummary ?? null,
        purchaseOrder: purchaseOrder as unknown as Record<string, unknown>,
      });
      await this.procurementWebhooksService.dispatchProcurementEvent({
        eventType: ProcurementWebhookEventType.PURCHASE_ORDER_UPDATED,
        eventKey: `procurement-purchase-order:${purchaseOrder.id}:${payload.action}:${payload.currentStatus}:${Date.now()}`,
        branchId: purchaseOrder.branchId,
        supplierProfileId: purchaseOrder.supplierProfileId,
        purchaseOrderId: purchaseOrder.id,
        payload: {
          purchaseOrderId: purchaseOrder.id,
          branchId: purchaseOrder.branchId,
          supplierProfileId: purchaseOrder.supplierProfileId,
          action: payload.action,
          previousStatus: payload.previousStatus,
          currentStatus: payload.currentStatus,
          actorId: payload.actorId,
          actorEmail: payload.actorEmail,
          reason: payload.reason,
          trackingReference: payload.trackingReference ?? null,
          occurredAt: new Date().toISOString(),
          metadata: payload.metadata ?? null,
          receiptSummary: payload.receiptSummary ?? null,
          purchaseOrder,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown realtime error';
      this.logger.warn(
        `Failed to broadcast procurement purchase-order update ${purchaseOrder.id}: ${message}`,
      );
    }
  }

  private async dispatchProcurementReceiptDiscrepancyWebhookEvent(
    purchaseOrderId: number,
    receiptEvent: PurchaseOrderReceiptEvent,
    payload: {
      eventType:
        | ProcurementWebhookEventType.RECEIPT_DISCREPANCY_RESOLVED
        | ProcurementWebhookEventType.RECEIPT_DISCREPANCY_APPROVED;
      action: 'DISCREPANCY_RESOLVED' | 'DISCREPANCY_APPROVED';
      actorId: number | null;
      actorEmail: string | null;
      note: string | null;
      metadata?: Record<string, any> | null;
      approvalMode?: 'STANDARD' | 'FORCE_CLOSE';
      previousDiscrepancyStatus?: PurchaseOrderReceiptDiscrepancyStatus | null;
    },
  ): Promise<void> {
    try {
      const purchaseOrder = await this.findOneById(purchaseOrderId);
      await this.procurementWebhooksService.dispatchProcurementEvent({
        eventType: payload.eventType,
        eventKey: `procurement-purchase-order:${purchaseOrderId}:receipt-discrepancy:${receiptEvent.id}:${payload.action}:${receiptEvent.discrepancyStatus ?? 'UNKNOWN'}:${Date.now()}`,
        branchId: purchaseOrder.branchId,
        supplierProfileId: purchaseOrder.supplierProfileId,
        purchaseOrderId,
        payload: {
          purchaseOrderId,
          receiptEventId: receiptEvent.id,
          branchId: purchaseOrder.branchId,
          supplierProfileId: purchaseOrder.supplierProfileId,
          action: payload.action,
          discrepancyStatus: receiptEvent.discrepancyStatus ?? null,
          previousDiscrepancyStatus: payload.previousDiscrepancyStatus ?? null,
          actorId: payload.actorId,
          actorEmail: payload.actorEmail,
          note: payload.note,
          occurredAt: new Date().toISOString(),
          metadata: payload.metadata ?? null,
          approvalMode: payload.approvalMode ?? null,
          receiptSummary: receiptEvent.receiptLines ?? null,
          receiptEvent,
          purchaseOrder,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown webhook error';
      this.logger.warn(
        `Failed to dispatch procurement receipt discrepancy webhook for purchase order ${purchaseOrderId} and receipt event ${receiptEvent.id}: ${message}`,
      );
    }
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
