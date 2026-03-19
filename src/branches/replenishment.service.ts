import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserRole } from '../auth/roles.enum';
import { BranchInventory } from './entities/branch-inventory.entity';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from '../purchase-orders/entities/purchase-order.entity';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import {
  SupplierAvailabilityStatus,
  SupplierOffer,
  SupplierOfferStatus,
} from '../supplier-offers/entities/supplier-offer.entity';
import { SupplierOnboardingStatus } from '../suppliers/entities/supplier-profile.entity';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import {
  RetailModule,
  TenantModuleEntitlement,
} from '../retail/entities/tenant-module-entitlement.entity';

const AUTO_REPLENISHMENT_MERGE_POLICY = 'MERGE_SAME_BRANCH_SUPPLIER_PRODUCT';

type ReplenishmentSubmissionMode = 'DRAFT_ONLY' | 'AUTO_SUBMIT';

type ReplenishmentOrderWindow = {
  daysOfWeek?: number[];
  startHour?: number;
  endHour?: number;
  timeZone?: string;
};

type ReplenishmentAutomationPolicy = {
  submissionMode: ReplenishmentSubmissionMode;
  orderWindow?: ReplenishmentOrderWindow;
  preferredSupplierProfileId?: number;
  minimumOrderTotal?: number;
};

type ReplenishmentTriggerContext = {
  actorUserId?: number | null;
  sourceTransferId?: number | null;
  trigger:
    | 'DISPATCHED_TRANSFER'
    | 'POS_SYNC'
    | 'INVENTORY_ADJUSTMENT'
    | 'MANUAL_REEVALUATION';
};

@Injectable()
export class ReplenishmentService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrdersRepository: Repository<PurchaseOrder>,
    @InjectRepository(SupplierOffer)
    private readonly supplierOffersRepository: Repository<SupplierOffer>,
    private readonly retailEntitlementsService: RetailEntitlementsService,
    @Inject(forwardRef(() => PurchaseOrdersService))
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  async maybeCreateDraftPurchaseOrder(
    inventory: BranchInventory,
    context: ReplenishmentTriggerContext,
    manager?: EntityManager,
  ): Promise<PurchaseOrder | null> {
    if ((inventory.availableToSell ?? 0) > (inventory.safetyStock ?? 0)) {
      return null;
    }

    const entitlement =
      await this.retailEntitlementsService.getActiveBranchModuleEntitlement(
        inventory.branchId,
        RetailModule.INVENTORY_AUTOMATION,
      );

    if (!entitlement) {
      return null;
    }

    const policy = this.resolveAutomationPolicy(entitlement);

    const purchaseOrdersRepository =
      manager?.getRepository(PurchaseOrder) ?? this.purchaseOrdersRepository;
    const supplierOffersRepository =
      manager?.getRepository(SupplierOffer) ?? this.supplierOffersRepository;

    const bestOffer = await supplierOffersRepository
      .createQueryBuilder('offer')
      .leftJoinAndSelect('offer.supplierProfile', 'supplierProfile')
      .where('offer.productId = :productId', { productId: inventory.productId })
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
      .orderBy('offer.unitWholesalePrice', 'ASC')
      .addOrderBy('offer.leadTimeDays', 'ASC')
      .addOrderBy('offer.id', 'ASC')
      .getOne();

    if (!bestOffer) {
      return null;
    }

    const orderedQuantity = Math.max(
      bestOffer.moq ?? 1,
      Math.max(
        (inventory.safetyStock ?? 0) - (inventory.availableToSell ?? 0),
        1,
      ),
    );
    const itemNote = `Auto replenishment triggered by ${context.trigger.toLowerCase()}${context.sourceTransferId ? ` ${context.sourceTransferId}` : ''}`;

    const openOrder = await purchaseOrdersRepository
      .createQueryBuilder('purchaseOrder')
      .leftJoinAndSelect('purchaseOrder.items', 'item')
      .where('purchaseOrder.branchId = :branchId', {
        branchId: inventory.branchId,
      })
      .andWhere('purchaseOrder.supplierProfileId = :supplierProfileId', {
        supplierProfileId: bestOffer.supplierProfileId,
      })
      .andWhere('purchaseOrder.status IN (:...statuses)', {
        statuses: [
          PurchaseOrderStatus.DRAFT,
          PurchaseOrderStatus.SUBMITTED,
          PurchaseOrderStatus.ACKNOWLEDGED,
          PurchaseOrderStatus.SHIPPED,
        ],
      })
      .andWhere('item.productId = :productId', {
        productId: inventory.productId,
      })
      .getOne();

    if (openOrder) {
      if (
        openOrder.status === PurchaseOrderStatus.DRAFT &&
        openOrder.statusMeta?.autoReplenishment === true
      ) {
        const mergedDraft = await this.mergeIntoDraft(
          purchaseOrdersRepository,
          openOrder,
          inventory,
          bestOffer,
          orderedQuantity,
          itemNote,
          context,
          policy,
        );

        return this.maybeAutoSubmitDraft(mergedDraft, policy, context, manager);
      }

      return null;
    }

    const existingAutoDraft = await purchaseOrdersRepository
      .createQueryBuilder('purchaseOrder')
      .leftJoinAndSelect('purchaseOrder.items', 'item')
      .where('purchaseOrder.branchId = :branchId', {
        branchId: inventory.branchId,
      })
      .andWhere('purchaseOrder.supplierProfileId = :supplierProfileId', {
        supplierProfileId: bestOffer.supplierProfileId,
      })
      .andWhere('purchaseOrder.status = :status', {
        status: PurchaseOrderStatus.DRAFT,
      })
      .andWhere("purchaseOrder.statusMeta ->> 'autoReplenishment' = 'true'")
      .orderBy('purchaseOrder.createdAt', 'DESC')
      .getOne();

    if (existingAutoDraft) {
      const mergedDraft = await this.mergeIntoDraft(
        purchaseOrdersRepository,
        existingAutoDraft,
        inventory,
        bestOffer,
        orderedQuantity,
        itemNote,
        context,
        policy,
      );

      return this.maybeAutoSubmitDraft(mergedDraft, policy, context, manager);
    }

    const expectedDeliveryDate = new Date();
    expectedDeliveryDate.setDate(
      expectedDeliveryDate.getDate() + (bestOffer.leadTimeDays ?? 0),
    );

    const purchaseOrder = purchaseOrdersRepository.create({
      branchId: inventory.branchId,
      supplierProfileId: bestOffer.supplierProfileId,
      currency: bestOffer.currency ?? 'USD',
      expectedDeliveryDate: expectedDeliveryDate.toISOString().slice(0, 10),
      orderNumber: `PO-AR-${Date.now()}-${inventory.branchId}-${inventory.productId}`,
      status: PurchaseOrderStatus.DRAFT,
      subtotal: orderedQuantity * bestOffer.unitWholesalePrice,
      total: orderedQuantity * bestOffer.unitWholesalePrice,
      statusMeta: {
        autoReplenishment: true,
        autoReplenishmentPolicy: AUTO_REPLENISHMENT_MERGE_POLICY,
        autoReplenishmentSubmissionMode: policy.submissionMode,
        autoReplenishmentOrderWindow: policy.orderWindow ?? null,
        autoReplenishmentPreferredSupplierProfileId:
          policy.preferredSupplierProfileId ?? null,
        autoReplenishmentMinimumOrderTotal: policy.minimumOrderTotal ?? null,
        replenishmentTrigger: context.trigger,
        sourceTransferId: context.sourceTransferId ?? null,
        actorUserId: context.actorUserId ?? null,
      },
      items: [
        {
          productId: inventory.productId,
          supplierOfferId: bestOffer.id,
          orderedQuantity,
          unitPrice: bestOffer.unitWholesalePrice,
          note: itemNote,
        } as PurchaseOrderItem,
      ],
    });

    const savedOrder = await purchaseOrdersRepository.save(purchaseOrder);
    return this.maybeAutoSubmitDraft(savedOrder, policy, context, manager);
  }

  async reevaluateDraftPurchaseOrder(
    purchaseOrder: PurchaseOrder,
    actorUserId?: number | null,
    manager?: EntityManager,
  ): Promise<PurchaseOrder> {
    if (
      purchaseOrder.status !== PurchaseOrderStatus.DRAFT ||
      purchaseOrder.statusMeta?.autoReplenishment !== true
    ) {
      return purchaseOrder;
    }

    const purchaseOrdersRepository =
      manager?.getRepository(PurchaseOrder) ?? this.purchaseOrdersRepository;
    const entitlement =
      await this.retailEntitlementsService.getActiveBranchModuleEntitlement(
        purchaseOrder.branchId,
        RetailModule.INVENTORY_AUTOMATION,
      );

    if (!entitlement) {
      purchaseOrder.statusMeta = {
        ...(purchaseOrder.statusMeta ?? {}),
        autoReplenishmentSubmissionMode: 'DRAFT_ONLY',
        autoReplenishmentOrderWindow: null,
        autoReplenishmentPreferredSupplierProfileId: null,
        autoReplenishmentMinimumOrderTotal: null,
        lastAutoSubmissionAttempt: {
          submissionMode: 'DRAFT_ONLY',
          eligible: false,
          blockedReason: 'AUTOMATION_NOT_ENTITLED',
          actorUserId: actorUserId ?? null,
          trigger: 'MANUAL_REEVALUATION',
          at: new Date().toISOString(),
        },
      };

      return purchaseOrdersRepository.save(purchaseOrder);
    }

    const policy = this.resolveAutomationPolicy(entitlement);
    purchaseOrder.statusMeta = {
      ...(purchaseOrder.statusMeta ?? {}),
      autoReplenishmentSubmissionMode: policy.submissionMode,
      autoReplenishmentOrderWindow: policy.orderWindow ?? null,
      autoReplenishmentPreferredSupplierProfileId:
        policy.preferredSupplierProfileId ?? null,
      autoReplenishmentMinimumOrderTotal: policy.minimumOrderTotal ?? null,
    };

    return this.maybeAutoSubmitDraft(
      purchaseOrder,
      policy,
      {
        actorUserId: actorUserId ?? null,
        trigger: 'MANUAL_REEVALUATION',
      },
      manager,
    );
  }

  private async mergeIntoDraft(
    purchaseOrdersRepository: Repository<PurchaseOrder>,
    draft: PurchaseOrder,
    inventory: BranchInventory,
    bestOffer: SupplierOffer,
    orderedQuantity: number,
    itemNote: string,
    context: ReplenishmentTriggerContext,
    policy: ReplenishmentAutomationPolicy,
  ): Promise<PurchaseOrder> {
    draft.items = draft.items ?? [];

    const existingItem = draft.items.find(
      (item) =>
        item.productId === inventory.productId &&
        (item.supplierOfferId ?? null) === (bestOffer.id ?? null),
    );

    if (existingItem) {
      existingItem.orderedQuantity += orderedQuantity;
      existingItem.unitPrice = bestOffer.unitWholesalePrice;
      existingItem.note = itemNote;
    } else {
      draft.items.push({
        productId: inventory.productId,
        supplierOfferId: bestOffer.id,
        orderedQuantity,
        unitPrice: bestOffer.unitWholesalePrice,
        note: itemNote,
      } as PurchaseOrderItem);
    }

    const lineAmount = orderedQuantity * bestOffer.unitWholesalePrice;
    draft.subtotal = Number(draft.subtotal) + lineAmount;
    draft.total = Number(draft.total) + lineAmount;
    draft.statusMeta = {
      ...(draft.statusMeta ?? {}),
      autoReplenishment: true,
      autoReplenishmentPolicy: AUTO_REPLENISHMENT_MERGE_POLICY,
      autoReplenishmentSubmissionMode: policy.submissionMode,
      autoReplenishmentOrderWindow: policy.orderWindow ?? null,
      autoReplenishmentPreferredSupplierProfileId:
        policy.preferredSupplierProfileId ?? null,
      autoReplenishmentMinimumOrderTotal: policy.minimumOrderTotal ?? null,
      lastAutoReplenishment: {
        trigger: context.trigger,
        sourceTransferId: context.sourceTransferId ?? null,
        actorUserId: context.actorUserId ?? null,
        productId: inventory.productId,
        orderedQuantity,
        mergedIntoExistingLine: existingItem != null,
        at: new Date().toISOString(),
      },
    };

    return purchaseOrdersRepository.save(draft);
  }

  private async maybeAutoSubmitDraft(
    purchaseOrder: PurchaseOrder,
    policy: ReplenishmentAutomationPolicy,
    context: ReplenishmentTriggerContext,
    manager?: EntityManager,
  ): Promise<PurchaseOrder> {
    if (purchaseOrder.status !== PurchaseOrderStatus.DRAFT) {
      return purchaseOrder;
    }

    const eligibility = this.evaluateAutoSubmitEligibility(
      purchaseOrder,
      policy,
    );
    purchaseOrder.statusMeta = {
      ...(purchaseOrder.statusMeta ?? {}),
      lastAutoSubmissionAttempt: {
        submissionMode: policy.submissionMode,
        eligible: eligibility.eligible,
        blockedReason: eligibility.reason ?? null,
        preferredSupplierProfileId: policy.preferredSupplierProfileId ?? null,
        minimumOrderTotal: policy.minimumOrderTotal ?? null,
        trigger: context.trigger,
        sourceTransferId: context.sourceTransferId ?? null,
        actorUserId: context.actorUserId ?? null,
        at: new Date().toISOString(),
      },
    };

    const purchaseOrdersRepository =
      manager?.getRepository(PurchaseOrder) ?? this.purchaseOrdersRepository;
    await purchaseOrdersRepository.save(purchaseOrder);

    if (policy.submissionMode !== 'AUTO_SUBMIT' || !eligibility.eligible) {
      return purchaseOrder;
    }

    const metadata = {
      autoReplenishment: {
        submissionMode: policy.submissionMode,
        trigger: context.trigger,
        sourceTransferId: context.sourceTransferId ?? null,
        policyWindow: policy.orderWindow ?? null,
        preferredSupplierProfileId: policy.preferredSupplierProfileId ?? null,
        minimumOrderTotal: policy.minimumOrderTotal ?? null,
      },
    };

    if (manager) {
      return this.purchaseOrdersService.updateStatusWithManager(
        purchaseOrder.id,
        {
          status: PurchaseOrderStatus.SUBMITTED,
          reason: 'Auto submitted by inventory automation policy',
          metadata,
        },
        manager,
        {
          id: context.actorUserId ?? null,
          roles: [UserRole.POS_MANAGER],
        },
      );
    }

    return this.purchaseOrdersService.updateStatus(
      purchaseOrder.id,
      {
        status: PurchaseOrderStatus.SUBMITTED,
        reason: 'Auto submitted by inventory automation policy',
        metadata,
      },
      {
        id: context.actorUserId ?? null,
        roles: [UserRole.POS_MANAGER],
      },
    );
  }

  private resolveAutomationPolicy(
    entitlement: TenantModuleEntitlement,
  ): ReplenishmentAutomationPolicy {
    const rawPolicy = entitlement.metadata?.replenishmentPolicy as
      | Record<string, any>
      | undefined;

    return {
      submissionMode:
        rawPolicy?.submissionMode === 'AUTO_SUBMIT'
          ? 'AUTO_SUBMIT'
          : 'DRAFT_ONLY',
      orderWindow: this.normalizeOrderWindow(rawPolicy?.orderWindow),
      preferredSupplierProfileId: this.normalizePositiveInteger(
        rawPolicy?.preferredSupplierProfileId,
      ),
      minimumOrderTotal: this.normalizePositiveNumber(
        rawPolicy?.minimumOrderTotal,
      ),
    };
  }

  private evaluateAutoSubmitEligibility(
    purchaseOrder: PurchaseOrder,
    policy: ReplenishmentAutomationPolicy,
  ): { eligible: boolean; reason?: string } {
    const orderWindowEligibility = this.evaluateOrderWindow(policy.orderWindow);
    if (!orderWindowEligibility.eligible) {
      return orderWindowEligibility;
    }

    if (
      policy.preferredSupplierProfileId != null &&
      purchaseOrder.supplierProfileId !== policy.preferredSupplierProfileId
    ) {
      return { eligible: false, reason: 'PREFERRED_SUPPLIER_REQUIRED' };
    }

    if (
      policy.minimumOrderTotal != null &&
      Number(purchaseOrder.total ?? 0) < policy.minimumOrderTotal
    ) {
      return { eligible: false, reason: 'MINIMUM_ORDER_TOTAL_NOT_MET' };
    }

    return { eligible: true };
  }

  private normalizeOrderWindow(
    rawWindow: Record<string, any> | undefined,
  ): ReplenishmentOrderWindow | undefined {
    if (!rawWindow || typeof rawWindow !== 'object') {
      return undefined;
    }

    const daysOfWeek = Array.isArray(rawWindow.daysOfWeek)
      ? Array.from(
          new Set(
            rawWindow.daysOfWeek.filter(
              (value) => Number.isInteger(value) && value >= 0 && value <= 6,
            ),
          ),
        )
      : undefined;
    const startHour = Number.isInteger(rawWindow.startHour)
      ? rawWindow.startHour
      : undefined;
    const endHour = Number.isInteger(rawWindow.endHour)
      ? rawWindow.endHour
      : undefined;
    const timeZone = this.normalizeTimeZone(rawWindow.timeZone);

    if (
      daysOfWeek == null &&
      startHour == null &&
      endHour == null &&
      timeZone == null
    ) {
      return undefined;
    }

    return {
      daysOfWeek: daysOfWeek?.length ? daysOfWeek : undefined,
      startHour:
        startHour != null && startHour >= 0 && startHour <= 23
          ? startHour
          : undefined,
      endHour:
        endHour != null && endHour >= 0 && endHour <= 23 ? endHour : undefined,
      timeZone: timeZone ?? undefined,
    };
  }

  private normalizeTimeZone(rawTimeZone: unknown): string | null {
    if (typeof rawTimeZone !== 'string' || rawTimeZone.trim().length === 0) {
      return null;
    }

    try {
      Intl.DateTimeFormat('en-US', { timeZone: rawTimeZone.trim() });
      return rawTimeZone.trim();
    } catch {
      return null;
    }
  }

  private normalizePositiveInteger(rawValue: unknown): number | undefined {
    if (
      rawValue == null ||
      !Number.isInteger(rawValue) ||
      Number(rawValue) < 1
    ) {
      return undefined;
    }

    return Number(rawValue);
  }

  private normalizePositiveNumber(rawValue: unknown): number | undefined {
    if (rawValue == null) {
      return undefined;
    }

    const normalizedValue = Number(rawValue);
    if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) {
      return undefined;
    }

    return Number(normalizedValue.toFixed(2));
  }

  private evaluateOrderWindow(orderWindow?: ReplenishmentOrderWindow): {
    eligible: boolean;
    reason?: string;
  } {
    if (!orderWindow) {
      return { eligible: true };
    }

    const now = new Date();
    const timeZone = orderWindow.timeZone ?? 'UTC';
    const dayOfWeek = this.getWeekdayInTimeZone(now, timeZone);
    const hour = this.getHourInTimeZone(now, timeZone);

    if (
      orderWindow.daysOfWeek?.length &&
      !orderWindow.daysOfWeek.includes(dayOfWeek)
    ) {
      return { eligible: false, reason: 'DAY_OF_WEEK_BLOCKED' };
    }

    if (
      orderWindow.startHour == null ||
      orderWindow.endHour == null ||
      orderWindow.startHour === orderWindow.endHour
    ) {
      return { eligible: true };
    }

    if (orderWindow.startHour < orderWindow.endHour) {
      return hour >= orderWindow.startHour && hour < orderWindow.endHour
        ? { eligible: true }
        : { eligible: false, reason: 'HOUR_OUTSIDE_WINDOW' };
    }

    return hour >= orderWindow.startHour || hour < orderWindow.endHour
      ? { eligible: true }
      : { eligible: false, reason: 'HOUR_OUTSIDE_WINDOW' };
  }

  private getWeekdayInTimeZone(date: Date, timeZone: string): number {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
    }).format(date);

    return (
      {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      }[weekday] ?? 0
    );
  }

  private getHourInTimeZone(date: Date, timeZone: string): number {
    const hourPart = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .find((part) => part.type === 'hour')?.value;

    return Number(hourPart ?? '0');
  }
}
