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
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../auth/roles.enum';
import { EmailService } from '../email/email.service';
import { GeneralLedgerService } from '../accounting/general-ledger.service';
import { GlAccountCode } from '../accounting/gl-accounts.constant';
import { GlJournalSourceType } from '../accounting/entities/gl-journal-entry.entity';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { ReplenishmentService } from '../branches/replenishment.service';
import { Branch } from '../branches/entities/branch.entity';
import { StockMovementType } from '../branches/entities/stock-movement.entity';
import { BranchCatalogProductLink } from '../retail/entities/branch-catalog-product-link.entity';
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
  SupplierActivationStatus,
  SupplierProfile,
} from '../suppliers/entities/supplier-profile.entity';
import {
  listOwnedSupplierProfileIds,
  resolveActiveOwnedProfile,
} from '../suppliers/active-supplier.util';
import { BrowseAvailableOffersQueryDto } from './dto/browse-available-offers-query.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ApprovePurchaseOrderReceiptDiscrepancyDto } from './dto/approve-purchase-order-receipt-discrepancy.dto';
import { AcknowledgePurchaseOrderReceiptDto } from './dto/acknowledge-purchase-order-receipt.dto';
import { RecordPurchaseOrderReceiptDto } from './dto/record-purchase-order-receipt.dto';
import { ResolvePurchaseOrderReceiptDiscrepancyDto } from './dto/resolve-purchase-order-receipt-discrepancy.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { SupplierStatusUpdateDto } from './dto/supplier-status-update.dto';
import { DeclinePurchaseOrderDto } from './dto/decline-purchase-order.dto';
import { ProposePurchaseOrderChangesDto } from './dto/propose-purchase-order-changes.dto';
import { RespondPurchaseOrderChangesDto } from './dto/respond-purchase-order-changes.dto';
import { DispatchPurchaseOrderDto } from './dto/dispatch-purchase-order.dto';
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
  /** Multi-supplier: the supplier profile the caller is currently operating. */
  supplierId?: number | null;
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
    PurchaseOrderStatus.CHANGES_PROPOSED,
    PurchaseOrderStatus.DECLINED,
    PurchaseOrderStatus.CANCELLED,
  ],
  // Counter-offer: the buyer accepts (→ ACKNOWLEDGED) or rejects (→ CANCELLED).
  [PurchaseOrderStatus.CHANGES_PROPOSED]: [
    PurchaseOrderStatus.ACKNOWLEDGED,
    PurchaseOrderStatus.CANCELLED,
  ],
  [PurchaseOrderStatus.ACKNOWLEDGED]: [
    PurchaseOrderStatus.SHIPPED,
    PurchaseOrderStatus.PARTIALLY_SHIPPED,
    PurchaseOrderStatus.CANCELLED,
  ],
  // The self-loop (next partial dispatch) is driven by the dedicated /dispatch
  // endpoint, NOT the generic pipeline (updateLoadedStatus early-returns on a
  // same-status transition); it stays here so the map documents the lifecycle.
  [PurchaseOrderStatus.PARTIALLY_SHIPPED]: [
    PurchaseOrderStatus.SHIPPED,
    PurchaseOrderStatus.PARTIALLY_SHIPPED,
    PurchaseOrderStatus.RECEIVED,
  ],
  [PurchaseOrderStatus.SHIPPED]: [PurchaseOrderStatus.RECEIVED],
  [PurchaseOrderStatus.RECEIVED]: [PurchaseOrderStatus.RECONCILED],
  [PurchaseOrderStatus.RECONCILED]: [],
  [PurchaseOrderStatus.DECLINED]: [],
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
    private readonly emailService: EmailService,
    private readonly generalLedger: GeneralLedgerService,
  ) {}

  /**
   * Post the goods-received entry for ONE receipt event: Dr Inventory / Cr
   * Supplier payables at the value of the goods actually received in this event
   * (Σ receivedQuantity × unitPrice) — so partial/multi-shipment receipts accrue
   * inventory incrementally, valued on the same unit-cost basis that COGS later
   * relieves it on. Posted with the caller's transaction `manager` so the ledger
   * entry commits or rolls back atomically with the receipt (no orphan), and
   * idempotent per receipt event.
   */
  private async postReceiptEventToLedger(
    purchaseOrder: PurchaseOrder,
    receiptSummary: ReceiptLineSummary[],
    idempotencyKey: string,
    occurredAt: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const priceByItemId = new Map(
      (purchaseOrder.items ?? []).map((item) => [
        item.id,
        Number(item.unitPrice) || 0,
      ]),
    );
    let receivedValue = 0;
    for (const line of receiptSummary ?? []) {
      receivedValue +=
        (priceByItemId.get(line.itemId) ?? 0) *
        (Number(line.receivedQuantity) || 0);
    }
    receivedValue = Math.round((receivedValue + Number.EPSILON) * 100) / 100;
    if (receivedValue <= 0) return;

    await this.generalLedger.post(
      {
        branchId: purchaseOrder.branchId,
        occurredAt,
        sourceType: GlJournalSourceType.PURCHASE_ORDER,
        sourceId: `po-${purchaseOrder.id}`,
        idempotencyKey,
        currency: purchaseOrder.currency || 'ETB',
        memo: `Goods received — PO ${purchaseOrder.id}`,
        lines: [
          { accountCode: GlAccountCode.INVENTORY, debit: receivedValue },
          {
            accountCode: GlAccountCode.SUPPLIER_PAYABLES,
            credit: receivedValue,
          },
        ],
      },
      manager,
    );
  }

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
    if (supplierProfile.activationStatus !== SupplierActivationStatus.ACTIVE) {
      throw new BadRequestException(
        'Purchase orders can only target active supplier profiles',
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

  /**
   * Supplier-side view of the same purchase-order resource: the orders addressed
   * to the signed-in supplier account. Suppliers are scoped by their resolved
   * supplierProfileId (NOT by branch — the PO's branch belongs to the buyer).
   * Draft orders are excluded since they have not yet been submitted to the
   * supplier. SUPER_ADMIN / ADMIN with no supplier profile get a support view of
   * every non-draft order.
   */
  async findIncoming(
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrder[]> {
    const roles = actor.roles ?? [];
    const supplierProfileId = await this.resolveActorSupplierProfileId(
      actor.id,
      actor.supplierId,
      roles,
    );

    if (!supplierProfileId) {
      const isSupportAdmin = this.hasAnyRole(roles, [
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
      ]);
      if (!isSupportAdmin) {
        return [];
      }
    }

    return this.purchaseOrdersRepository.find({
      where: {
        status: Not(PurchaseOrderStatus.DRAFT),
        ...(supplierProfileId ? { supplierProfileId } : {}),
      },
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
      .andWhere('supplierProfile.activationStatus = :supplierStatus', {
        supplierStatus: SupplierActivationStatus.ACTIVE,
      })
      .andWhere('supplierProfile.isActive = true')
      .orderBy(orderColumn, 'ASC')
      .addOrderBy('offer.leadTimeDays', 'ASC')
      .addOrderBy('offer.id', 'ASC')
      .take(limit)
      .getMany();

    return offers.map((offer) => this.mapBrowseOffer(offer));
  }

  /** Shared offer → buyer-facing DTO mapping (browse + storefront). */
  private mapBrowseOffer(offer: SupplierOffer) {
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
  }

  /**
   * Buyer-facing supplier storefront directory: active suppliers that have at
   * least one published, in-stock offer, with their offer count. The B2B mirror
   * of a "browse vendors" page — lets a business discover whole suppliers
   * instead of only reverse-looking-up a single product via findAvailableOffers.
   */
  async listSupplierStorefronts(query: {
    search?: string;
    limit?: number;
  }): Promise<
    Array<{
      supplierProfileId: number;
      supplierName: string;
      countriesServed: string[];
      offerCount: number;
    }>
  > {
    const limit = Math.max(1, Math.min(100, Number(query.limit ?? 50)));
    const qb = this.supplierOffersRepository
      .createQueryBuilder('offer')
      .innerJoin('offer.supplierProfile', 'sp')
      .select('sp.id', 'supplierProfileId')
      .addSelect('sp.companyName', 'companyName')
      .addSelect('sp.legalName', 'legalName')
      .addSelect('sp.countriesServed', 'countriesServed')
      .addSelect('COUNT(offer.id)', 'offerCount')
      .where('offer.status = :status', {
        status: SupplierOfferStatus.PUBLISHED,
      })
      .andWhere('offer.availabilityStatus != :oos', {
        oos: SupplierAvailabilityStatus.OUT_OF_STOCK,
      })
      .andWhere('sp.activationStatus = :active', {
        active: SupplierActivationStatus.ACTIVE,
      })
      .andWhere('sp.isActive = true')
      .groupBy('sp.id')
      .addGroupBy('sp.companyName')
      .addGroupBy('sp.legalName')
      .addGroupBy('sp.countriesServed')
      .orderBy('sp.companyName', 'ASC')
      .limit(limit);
    if (query.search) {
      qb.andWhere('sp.companyName ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      supplierProfileId: Number(r.supplierProfileId),
      supplierName:
        r.companyName || r.legalName || `Supplier #${r.supplierProfileId}`,
      countriesServed: Array.isArray(r.countriesServed)
        ? r.countriesServed
        : [],
      offerCount: Number(r.offerCount) || 0,
    }));
  }

  /**
   * Buyer-facing per-supplier catalog: every published offer for one active
   * supplier, in the same shape as findAvailableOffers so the buyer UI can
   * reuse the offer card.
   */
  async findSupplierStorefront(supplierId: number) {
    const profile = await this.supplierProfilesRepository.findOne({
      where: { id: supplierId },
    });
    if (
      !profile ||
      !profile.isActive ||
      profile.activationStatus !== SupplierActivationStatus.ACTIVE
    ) {
      throw new NotFoundException(`Supplier ${supplierId} is not available`);
    }
    const offers = await this.supplierOffersRepository
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.supplierProfile', 'supplierProfile')
      .leftJoinAndSelect('offer.product', 'product')
      .leftJoinAndSelect('product.images', 'productImages')
      .where('offer.supplierProfileId = :supplierId', { supplierId })
      .andWhere('offer.status = :status', {
        status: SupplierOfferStatus.PUBLISHED,
      })
      .orderBy('offer.unitWholesalePrice', 'ASC')
      .addOrderBy('offer.id', 'ASC')
      .getMany();
    return {
      supplier: {
        supplierProfileId: profile.id,
        supplierName:
          profile.companyName || profile.legalName || `Supplier #${profile.id}`,
        countriesServed: profile.countriesServed ?? [],
      },
      offers: offers.map((offer) => this.mapBrowseOffer(offer)),
    };
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
      ![
        PurchaseOrderStatus.PARTIALLY_SHIPPED,
        PurchaseOrderStatus.SHIPPED,
        PurchaseOrderStatus.RECEIVED,
      ].includes(purchaseOrder.status)
    ) {
      throw new BadRequestException(
        'Receipt events can only be recorded for shipped or received purchase orders',
      );
    }

    this.assertRoleAllowedForStatus(
      previousStatus,
      PurchaseOrderStatus.RECEIVED,
      roles,
    );

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
      await this.stageReceivedProductsIntoCatalog(
        purchaseOrder,
        receiptSummary,
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

    // Non-fatal PO status notification email to actor
    if (actor.email) {
      const poItems =
        dto.status === PurchaseOrderStatus.RECEIVED
          ? (updatedPurchaseOrder.items ?? []).map(
              (item: PurchaseOrderItem) => ({
                name:
                  (item as any).product?.name ||
                  (item as any).productName ||
                  `Product #${item.productId}`,
                qty: item.orderedQuantity,
                unitCost: item.unitPrice,
              }),
            )
          : undefined;

      void this.emailService
        .sendPurchaseOrderStatusEmail({
          to: actor.email,
          poNumber: updatedPurchaseOrder.orderNumber,
          status: updatedPurchaseOrder.status,
          branchName: (updatedPurchaseOrder as any).branch?.name,
          supplierName: updatedPurchaseOrder.supplierProfile?.companyName,
          total: updatedPurchaseOrder.total,
          currency: updatedPurchaseOrder.currency,
          reason: dto.reason ?? null,
          items: poItems,
        })
        .catch((err: any) => {
          this.logger.warn(
            `PO status email failed for PO ${updatedPurchaseOrder.id}: ${err?.message}`,
          );
        });
    }

    return updatedPurchaseOrder;
  }

  /**
   * Supplier-authorized status transition for an incoming purchase order. Only
   * the supplier's two transitions are valid (SUBMITTED → ACKNOWLEDGED and
   * ACKNOWLEDGED → SHIPPED); ownership is enforced against the caller's resolved
   * supplierProfileId so a supplier can never touch another supplier's orders.
   * All the shared side effects (timestamps, webhooks, audit, email) flow through
   * the same updateStatus pipeline the buyer path uses.
   */
  async updateSupplierStatus(
    id: number,
    dto: SupplierStatusUpdateDto,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrder> {
    if (
      dto.status !== PurchaseOrderStatus.ACKNOWLEDGED &&
      dto.status !== PurchaseOrderStatus.SHIPPED
    ) {
      throw new BadRequestException(
        'Suppliers can only acknowledge or mark purchase orders as shipped',
      );
    }

    await this.assertSupplierAuthorizedForOrder(id, actor);

    // Delegate to the shared status pipeline; clear branchId so the re-load
    // inside updateStatus is by id only (the supplier's branch ≠ the PO branch).
    return this.updateStatus(id, dto, { ...actor, branchId: undefined });
  }

  /**
   * Loads a purchase order by id (no branch scope) and asserts the caller's
   * supplier account is the one the order is addressed to. The ownership
   * boundary for every supplier-driven action is supplierProfileId — never the
   * branch (the PO's branch belongs to the buyer). SUPER_ADMIN / ADMIN bypass for
   * support. Returns the loaded order so callers don't re-fetch.
   */
  private async assertSupplierAuthorizedForOrder(
    id: number,
    actor: PurchaseOrderActorContext,
  ): Promise<PurchaseOrder> {
    const roles = actor.roles ?? [];
    const purchaseOrder = await this.findOneById(id);

    if (this.hasAnyRole(roles, [UserRole.SUPER_ADMIN, UserRole.ADMIN])) {
      return purchaseOrder;
    }

    // Multi-supplier: the user may own several supplier accounts, so authorize
    // against ALL of them — the PO must be addressed to one the user owns.
    const ownedSupplierProfileIds = actor.id
      ? await listOwnedSupplierProfileIds(
          this.supplierProfilesRepository,
          actor.id,
        )
      : [];
    if (
      !purchaseOrder.supplierProfileId ||
      !ownedSupplierProfileIds.includes(purchaseOrder.supplierProfileId)
    ) {
      throw new ForbiddenException(
        'You can only update purchase orders addressed to your supplier account',
      );
    }

    return purchaseOrder;
  }

  /**
   * Supplier declines an incoming order (SUBMITTED → DECLINED). Terminal — the
   * buyer can re-draft from the declined order. Runs through the shared status
   * pipeline so fanout/webhook/audit/email all fire.
   */
  async declineOrder(
    id: number,
    dto: DeclinePurchaseOrderDto,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrder> {
    await this.assertSupplierAuthorizedForOrder(id, actor);
    return this.updateStatus(
      id,
      {
        status: PurchaseOrderStatus.DECLINED,
        reason: dto.reason,
        metadata: {
          decline: {
            reason: dto.reason,
            byUserId: actor.id ?? null,
            at: new Date().toISOString(),
          },
        },
      },
      { ...actor, branchId: undefined },
    );
  }

  /**
   * Supplier counter-offers amended quantities/prices/delivery (SUBMITTED →
   * CHANGES_PROPOSED). The proposal is stored on statusMeta.proposedChanges and
   * is only applied to the real line items if the buyer accepts (respondToChanges).
   */
  async proposeChanges(
    id: number,
    dto: ProposePurchaseOrderChangesDto,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrder> {
    await this.assertSupplierAuthorizedForOrder(id, actor);
    return this.updateStatus(
      id,
      {
        status: PurchaseOrderStatus.CHANGES_PROPOSED,
        reason: dto.note,
        metadata: {
          proposedChanges: {
            proposedLines: dto.proposedLines,
            proposedDeliveryDate: dto.proposedDeliveryDate ?? null,
            note: dto.note ?? null,
            byUserId: actor.id ?? null,
            at: new Date().toISOString(),
          },
        },
      },
      { ...actor, branchId: undefined },
    );
  }

  /**
   * Buyer responds to a supplier counter-offer (CHANGES_PROPOSED).
   *  - REJECT → CANCELLED.
   *  - ACCEPT → apply the proposed line changes + recompute totals (in a
   *    projection-synced transaction so inbound open-PO stock tracks the new
   *    quantities), then advance to ACKNOWLEDGED through the shared pipeline.
   */
  async respondToChanges(
    id: number,
    dto: RespondPurchaseOrderChangesDto,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrder> {
    if (dto.decision === 'REJECT') {
      return this.updateStatus(
        id,
        {
          status: PurchaseOrderStatus.CANCELLED,
          reason: dto.note ?? 'Counter-offer rejected by buyer',
        },
        actor,
      );
    }

    const purchaseOrder = await this.findOneById(id, {
      branchId: actor.branchId,
    });
    if (purchaseOrder.status !== PurchaseOrderStatus.CHANGES_PROPOSED) {
      throw new BadRequestException(
        'Only a purchase order with proposed changes can be accepted',
      );
    }

    // Apply the amended quantities/prices/date and recompute totals, syncing the
    // inbound open-PO projection against the pre-change quantities (the status
    // flip below is projection-neutral, so the quantity delta must register here).
    const previousInboundProjection =
      this.buildInboundOpenPoProjection(purchaseOrder);
    this.applyProposedChangesToOrder(purchaseOrder);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(PurchaseOrder).save(purchaseOrder);
      await this.syncInboundOpenPoProjection(
        purchaseOrder,
        previousInboundProjection,
        manager,
      );
    });

    return this.updateStatus(
      id,
      {
        status: PurchaseOrderStatus.ACKNOWLEDGED,
        reason: dto.note ?? 'Counter-offer accepted by buyer',
      },
      actor,
    );
  }

  /**
   * Supplier (partially) dispatches an acknowledged order. Each line's shipped
   * quantity is incremented (capped at ordered); the order then becomes SHIPPED
   * if every line is fully shipped, otherwise PARTIALLY_SHIPPED. Shipping does
   * not touch the GL or the inbound projection (only receipt does) — it only
   * records progress, so the item save + a status pass through the shared
   * pipeline (which fires the realtime fanout / email even when the status is
   * unchanged on a follow-up partial dispatch).
   */
  async dispatchOrder(
    id: number,
    dto: DispatchPurchaseOrderDto,
    actor: PurchaseOrderActorContext = {},
  ): Promise<PurchaseOrder> {
    const purchaseOrder = await this.assertSupplierAuthorizedForOrder(id, actor);

    if (
      ![
        PurchaseOrderStatus.ACKNOWLEDGED,
        PurchaseOrderStatus.PARTIALLY_SHIPPED,
      ].includes(purchaseOrder.status)
    ) {
      throw new BadRequestException(
        'Only an acknowledged or partially shipped purchase order can be dispatched',
      );
    }

    const itemById = new Map(purchaseOrder.items.map((it) => [it.id, it]));

    // Validate every line before mutating any.
    for (const line of dto.lines) {
      const item = itemById.get(line.itemId);
      if (!item) {
        throw new BadRequestException(
          `Line item ${line.itemId} is not on purchase order ${id}`,
        );
      }
      const increment = Number(line.shippedQuantity) || 0;
      if (increment < 0) {
        throw new BadRequestException('Shipped quantity cannot be negative');
      }
      if ((item.shippedQuantity ?? 0) + increment > item.orderedQuantity) {
        throw new BadRequestException(
          `Shipped quantity exceeds the ${item.orderedQuantity} ordered for purchase order item ${line.itemId}`,
        );
      }
    }

    let shippedAnything = false;
    for (const line of dto.lines) {
      const increment = Number(line.shippedQuantity) || 0;
      if (increment <= 0) continue;
      const item = itemById.get(line.itemId)!;
      item.shippedQuantity = (item.shippedQuantity ?? 0) + increment;
      shippedAnything = true;
    }
    if (!shippedAnything) {
      throw new BadRequestException('No quantities were shipped in this dispatch');
    }

    // Stamp the first-dispatch time + tracking; persist the per-line shipped
    // quantities (the shared pipeline below reloads from this save).
    if (!purchaseOrder.shippedAt) {
      purchaseOrder.shippedAt = new Date();
    }
    purchaseOrder.statusMeta = {
      ...(purchaseOrder.statusMeta ?? {}),
      shipping: {
        trackingReference:
          dto.trackingReference ??
          purchaseOrder.statusMeta?.shipping?.trackingReference ??
          null,
        shippedAt: purchaseOrder.shippedAt.toISOString(),
      },
    };
    await this.purchaseOrdersRepository.save(purchaseOrder);

    const fullyShipped = purchaseOrder.items.every(
      (it) => (it.shippedQuantity ?? 0) >= it.orderedQuantity,
    );
    const nextStatus = fullyShipped
      ? PurchaseOrderStatus.SHIPPED
      : PurchaseOrderStatus.PARTIALLY_SHIPPED;

    return this.updateStatus(
      id,
      {
        status: nextStatus,
        trackingReference: dto.trackingReference,
        reason: dto.note,
      },
      { ...actor, branchId: undefined },
    );
  }

  /**
   * Applies statusMeta.proposedChanges onto the loaded order's line items and
   * recomputes subtotal/total (total = subtotal; the model carries no tax/ship
   * line). Throws if there is nothing to apply.
   */
  private applyProposedChangesToOrder(purchaseOrder: PurchaseOrder): void {
    const proposed = (purchaseOrder.statusMeta?.proposedChanges ?? null) as {
      proposedLines?: {
        itemId: number;
        proposedQuantity?: number;
        proposedUnitPrice?: number;
      }[];
      proposedDeliveryDate?: string | null;
    } | null;

    if (!proposed?.proposedLines?.length) {
      throw new BadRequestException(
        'This purchase order has no proposed changes to accept',
      );
    }

    const changeByItemId = new Map(
      proposed.proposedLines.map((line) => [line.itemId, line]),
    );
    for (const item of purchaseOrder.items) {
      const change = changeByItemId.get(item.id);
      if (!change) continue;
      if (change.proposedQuantity != null) {
        item.orderedQuantity = change.proposedQuantity;
      }
      if (change.proposedUnitPrice != null) {
        item.unitPrice = change.proposedUnitPrice;
      }
    }

    if (proposed.proposedDeliveryDate) {
      purchaseOrder.expectedDeliveryDate = proposed.proposedDeliveryDate;
    }

    const subtotal = purchaseOrder.items.reduce(
      (sum, item) => sum + item.orderedQuantity * Number(item.unitPrice),
      0,
    );
    purchaseOrder.subtotal = subtotal;
    purchaseOrder.total = subtotal;
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

    this.assertRoleAllowedForStatus(previousStatus, nextStatus, roles);

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

    let result: PurchaseOrder;
    if (manager) {
      await persistStatusUpdate(manager);
      result = await this.findOneByIdUsingRepository(
        manager.getRepository(PurchaseOrder),
        id,
      );
    } else {
      await this.dataSource.transaction(persistStatusUpdate);
      result = await this.findOneById(id);
    }

    // The goods-received ledger entry is posted inside persistReceiptEvent (the
    // single chokepoint both receive paths flow through), valued per event and
    // atomic with the receipt — so nothing to post here.

    return result;
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

    // Supplier decline: persist the reason at top-level statusMeta so the buyer
    // can surface it (and re-draft). No dedicated timestamp column — the time
    // rides inside statusMeta.decline.
    if (status === PurchaseOrderStatus.DECLINED) {
      purchaseOrder.statusMeta = {
        ...(purchaseOrder.statusMeta ?? {}),
        decline: (dto.metadata as any)?.decline ?? {
          reason: dto.reason ?? null,
          at: now.toISOString(),
        },
      };
    }

    // Supplier counter-offer: keep the proposed lines/date at top-level
    // statusMeta (survives the next lastTransition overwrite) until the buyer
    // accepts or rejects.
    if (status === PurchaseOrderStatus.CHANGES_PROPOSED) {
      purchaseOrder.statusMeta = {
        ...(purchaseOrder.statusMeta ?? {}),
        proposedChanges: (dto.metadata as any)?.proposedChanges ?? null,
      };
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

  /**
   * Last mile of the supply chain: when a branch receives a PO, auto-stage every
   * received product into the receiving branch's retail catalog so it becomes a
   * sellable, listable branch product (operator confirms price + listing later).
   * Stock is already posted by persistReceiptSideEffects; this only adds the shelf
   * entry. Staged links are created with consumer_visible=false / retail_price=null
   * (the "needs setup" state) and skipped for products already in the branch catalog,
   * so a manual link is never overwritten.
   */
  private async stageReceivedProductsIntoCatalog(
    purchaseOrder: PurchaseOrder,
    receiptSummary: ReceiptLineSummary[],
    manager: EntityManager,
  ): Promise<void> {
    const branchId = purchaseOrder.branchId;
    if (!branchId) {
      return;
    }

    const productIds = [
      ...new Set(
        receiptSummary
          .filter((line) => line.receivedQuantity > 0 && line.productId)
          .map((line) => line.productId),
      ),
    ];
    if (!productIds.length) {
      return;
    }

    const repo = manager.getRepository(BranchCatalogProductLink);
    const existing = await repo.find({
      where: { branchId, productId: In(productIds) },
    });
    const alreadyLinked = new Set(existing.map((link) => link.productId));

    const toCreate = productIds.filter((id) => !alreadyLinked.has(id));
    if (!toCreate.length) {
      return;
    }

    await repo.save(
      toCreate.map((productId) =>
        repo.create({
          branchId,
          productId,
          retailPrice: null,
          retailSalePrice: null,
          consumerVisible: false,
          source: 'PURCHASE_ORDER',
          sourceSupplierProfileId: purchaseOrder.supplierProfileId ?? null,
          sourcePurchaseOrderId: purchaseOrder.id,
        }),
      ),
    );
  }

  private buildInboundOpenPoProjection(
    purchaseOrder: PurchaseOrder,
  ): Map<number, number> {
    const activeStatuses = new Set<PurchaseOrderStatus>([
      PurchaseOrderStatus.SUBMITTED,
      PurchaseOrderStatus.CHANGES_PROPOSED,
      PurchaseOrderStatus.ACKNOWLEDGED,
      PurchaseOrderStatus.PARTIALLY_SHIPPED,
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

    const savedEvent = await receiptEventsRepository.save(
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

    // Recognize the goods received in this event against supplier payables, in
    // the same transaction (atomic — no orphan) and idempotent per event.
    await this.postReceiptEventToLedger(
      purchaseOrder,
      receiptSummary,
      `po-receipt-event-${savedEvent.id}`,
      savedEvent.createdAt ?? new Date(),
      manager,
    );
  }

  /**
   * Resolve the supplier profile that the acting user owns, if any. Returns null
   * for users without a supplier profile (e.g. buyers, admins).
   */
  private async resolveActorSupplierProfileId(
    userId?: number | null,
    preferredSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<number | null> {
    if (!userId) {
      return null;
    }
    const profile = await resolveActiveOwnedProfile(
      this.supplierProfilesRepository,
      userId,
      preferredSupplierId,
      actingRoles,
    );
    return profile?.id ?? null;
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
    previousStatus: PurchaseOrderStatus,
    targetStatus: PurchaseOrderStatus,
    roles: string[],
  ): void {
    if (this.hasAnyRole(roles, [UserRole.SUPER_ADMIN, UserRole.ADMIN])) {
      return;
    }

    const buyerRoles = [UserRole.POS_MANAGER, UserRole.B2B_BUYER];
    const supplierRoles = [UserRole.SUPPLIER_ACCOUNT];

    // ACKNOWLEDGED is reachable two ways, disambiguated by the from-status:
    // SUBMITTED→ACKNOWLEDGED is the supplier acknowledging; CHANGES_PROPOSED→
    // ACKNOWLEDGED is the BUYER accepting the supplier's counter-offer.
    const isBuyerAcceptOfCounterOffer =
      previousStatus === PurchaseOrderStatus.CHANGES_PROPOSED &&
      targetStatus === PurchaseOrderStatus.ACKNOWLEDGED;
    const isSupplierAcknowledge =
      previousStatus === PurchaseOrderStatus.SUBMITTED &&
      targetStatus === PurchaseOrderStatus.ACKNOWLEDGED;

    // Buyer lane: submit, accept a counter-offer, receive, reconcile.
    if (
      ([
        PurchaseOrderStatus.SUBMITTED,
        PurchaseOrderStatus.RECEIVED,
        PurchaseOrderStatus.RECONCILED,
      ].includes(targetStatus) ||
        isBuyerAcceptOfCounterOffer) &&
      this.hasAnyRole(roles, buyerRoles)
    ) {
      return;
    }

    // Supplier lane: acknowledge a fresh submit, counter-offer, decline,
    // (partially) ship.
    if (
      (isSupplierAcknowledge ||
        [
          PurchaseOrderStatus.CHANGES_PROPOSED,
          PurchaseOrderStatus.DECLINED,
          PurchaseOrderStatus.PARTIALLY_SHIPPED,
          PurchaseOrderStatus.SHIPPED,
        ].includes(targetStatus)) &&
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
