import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { VariantInventoryService } from '../branches/variant-inventory.service';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { Branch } from '../branches/entities/branch.entity';
import { StockMovementType } from '../branches/entities/stock-movement.entity';
import { PartnerCredential } from '../partner-credentials/entities/partner-credential.entity';
import { ProductAliasesService } from '../product-aliases/product-aliases.service';
import { Product } from '../products/entities/product.entity';
import { EmailService } from '../email/email.service';
import {
  GeneralLedgerService,
  JournalLineInput,
} from '../accounting/general-ledger.service';
import { GlAccountCode } from '../accounting/gl-accounts.constant';
import { GlJournalSourceType } from '../accounting/entities/gl-journal-entry.entity';
import { splitTenders } from '../accounting/tender-split.util';
import { ProductCostService } from '../purchase-orders/product-cost.service';
import {
  IngestPosCheckoutDto,
  PosCheckoutItemDto,
} from './dto/ingest-pos-checkout.dto';
import { SettleReceivableDto } from './dto/settle-receivable.dto';
import { PosCheckoutQuoteResponseDto } from './dto/pos-checkout-quote-response.dto';
import { ListPosCheckoutsQueryDto } from './dto/list-pos-checkouts-query.dto';
import {
  PosCheckoutPageResponseDto,
  PosCheckoutResponseDto,
} from './dto/pos-checkout-response.dto';
import { TaxSummaryQueryDto } from './dto/tax-summary-query.dto';
import {
  TaxSummaryResponseDto,
  TaxSummaryRateBucketDto,
  TaxSummaryShiftDto,
} from './dto/tax-summary-response.dto';
import { StylistSummaryQueryDto } from './dto/stylist-summary-query.dto';
import { StylistSummaryResponseDto } from './dto/stylist-summary-response.dto';
import {
  QuotePosCheckoutDto,
  QuotePosCheckoutItemDto,
} from './dto/quote-pos-checkout.dto';
import { VoidPosCheckoutDto } from './dto/void-pos-checkout.dto';
import {
  PosRegisterSession,
  PosRegisterSessionStatus,
} from './entities/pos-register-session.entity';
import {
  PosCheckout,
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from './entities/pos-checkout.entity';
import {
  PosSuspendedCart,
  PosSuspendedCartStatus,
} from './entities/pos-suspended-cart.entity';

const POS_PROMO_CODES = {
  SAVE5: {
    code: 'SAVE5',
    label: '5% basket discount',
    percentage: 0.05,
    minSubtotal: 0,
  },
  MARKET10: {
    code: 'MARKET10',
    label: '10% market basket discount',
    percentage: 0.1,
    minSubtotal: 1000,
  },
  FAMILY15: {
    code: 'FAMILY15',
    label: '15% family basket discount',
    percentage: 0.15,
    minSubtotal: 2000,
  },
} as const;

const POS_CUSTOMER_PRICING_RULES = {
  PUBLIC: {
    code: 'PUBLIC',
    label: 'Public guest',
    description:
      'Standard menu pricing for regular cafeteria or restaurant checkout.',
    discountRate: 0,
  },
  STAFF_MEAL: {
    code: 'STAFF_MEAL',
    label: 'Staff meal',
    description: 'Apply a 15% meal discount for internal staff orders.',
    discountRate: 0.15,
  },
  COMPANY_SUBSIDIZED: {
    code: 'COMPANY_SUBSIDIZED',
    label: 'Company subsidized',
    description: 'Apply a 30% subsidy for approved internal meal programs.',
    discountRate: 0.3,
  },
} as const;

type PosCustomerPricingRule =
  (typeof POS_CUSTOMER_PRICING_RULES)[keyof typeof POS_CUSTOMER_PRICING_RULES];

type QuoteLine = {
  lineId?: string | null;
  productId?: number | null;
  sku?: string | null;
  title?: string | null;
  category?: string | null;
  metadata?: Record<string, any> | null;
  currency: string;
  taxRate: number;
  unitPrice: number;
  quantity: number;
  grossSubtotal: number;
  customerTypeDiscount: number;
  automaticDiscount: number;
  promoCodeDiscount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
  promotionLabels: string[];
};

type ResolvedQuoteLineInput = {
  lineId?: string | null;
  productId?: number | null;
  sku?: string | null;
  title?: string | null;
  category?: string | null;
  metadata?: Record<string, any> | null;
  currency: string;
  taxRate: number;
  unitPrice: number;
  quantity: number;
};

const NORMALIZED_CHECKOUT_ITEM_METADATA_KEYS = [
  'serviceFormat',
  'serviceType',
  'tableArea',
  'tableStatus',
  'course',
  'courseServiceState',
] as const;

const NORMALIZED_CHECKOUT_ITEM_LABEL_KEYS = [
  'tableId',
  'tableLabel',
  'seatLabel',
  'billId',
  'billLabel',
  'serviceOwner',
  'courseOrderedAt',
  'courseFiredAt',
  'courseReadyAt',
  'courseServedAt',
  'stylistUserId',
  'stylistName',
] as const;

@Injectable()
export class PosCheckoutService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PosCheckout)
    private readonly posCheckoutsRepository: Repository<PosCheckout>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(PartnerCredential)
    private readonly partnerCredentialsRepository: Repository<PartnerCredential>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(PosRegisterSession)
    private readonly registerSessionsRepository: Repository<PosRegisterSession>,
    @InjectRepository(PosSuspendedCart)
    private readonly suspendedCartsRepository: Repository<PosSuspendedCart>,
    private readonly inventoryLedgerService: InventoryLedgerService,
    private readonly variantInventoryService: VariantInventoryService,
    private readonly productAliasesService: ProductAliasesService,
    private readonly emailService: EmailService,
    private readonly generalLedger: GeneralLedgerService,
    private readonly productCost: ProductCostService,
  ) {}

  private readonly logger = new Logger(PosCheckoutService.name);

  /**
   * Resolve the authoritative occurredAt for a checkout — independent of the POS
   * device clock.
   *
   * The daily reports bucket sales by occurredAt (EAT calendar day), so a device
   * with a fast/mis-set clock could otherwise misfile a sale into the wrong day.
   * We therefore trust the client-captured time in all cases, but apply strict
   * clamping to prevent future-dated entries:
   *
   *  - Any capture: use the client-supplied occurredAt as the authoritative time
   *    (it reflects when the operator actually rang up the sale).
   *  - Future timestamps (> 2 min ahead of server): clamp to server "now" to
   *    guard against device clocks that are running fast.
   *
   * Why we no longer use server receive-time for ONLINE_CAPTURED:
   * The previous approach stamped server "now" at sync time, not capture time.
   * Any brief network blip that queued a receipt in the outbox (even for < 1 s)
   * could delay the sync across an EAT midnight boundary and file the sale into
   * the wrong report day — exactly the scenario we must prevent.  An NTP-synced
   * online device's capture timestamp is just as authoritative as the server's
   * and avoids the race entirely.
   */
  private resolveOccurredAt(
    rawOccurredAt: string,
    captureState?: string | null,
  ): Date {
    const serverNow = new Date();

    // Trust the real capture time, but never accept a timestamp in the future.
    const FUTURE_GRACE_MS = 2 * 60_000; // tolerate ~2 min of skew + network latency
    const parsed = new Date(rawOccurredAt);
    if (Number.isNaN(parsed.getTime())) {
      return serverNow;
    }
    if (parsed.getTime() > serverNow.getTime() + FUTURE_GRACE_MS) {
      this.logger.warn(
        `POS checkout occurredAt ${parsed.toISOString()} is ahead of server time ` +
          `${serverNow.toISOString()} — clamping to server time (device clock skew).`,
      );
      return serverNow;
    }
    return parsed;
  }

  async quote(dto: QuotePosCheckoutDto): Promise<PosCheckoutQuoteResponseDto> {
    if (!dto.items.length) {
      throw new BadRequestException(
        'POS checkout quote requires at least one item',
      );
    }

    await this.assertScope(dto.branchId, undefined);
    const resolvedLines = await Promise.all(
      dto.items.map((item) => this.resolveQuoteLine(dto.branchId, item)),
    );

    return this.buildQuoteResponse(dto, resolvedLines);
  }

  async findAll(
    query: ListPosCheckoutsQueryDto,
  ): Promise<PosCheckoutPageResponseDto> {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.limit ?? 20, 1), 200);

    const qb = this.posCheckoutsRepository
      .createQueryBuilder('checkout')
      .where('checkout.branchId = :branchId', { branchId: query.branchId })
      // Never surface VOIDED records in normal list/report queries.
      // Callers can still fetch a specific voided checkout by id.
      .andWhere('checkout.status != :voided', {
        voided: PosCheckoutStatus.VOIDED,
      })
      .orderBy('checkout.occurredAt', 'DESC')
      .addOrderBy('checkout.id', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (query.status) {
      qb.andWhere('checkout.status = :status', { status: query.status });
    }

    if (query.transactionType) {
      qb.andWhere('checkout.transactionType = :transactionType', {
        transactionType: query.transactionType,
      });
    }

    if (query.registerId) {
      qb.andWhere('checkout.registerId = :registerId', {
        registerId: query.registerId,
      });
    }

    if (query.registerSessionId) {
      qb.andWhere('checkout.registerSessionId = :registerSessionId', {
        registerSessionId: query.registerSessionId,
      });
    }

    if (query.fromAt) {
      const fromAt = new Date(query.fromAt);
      if (!Number.isNaN(fromAt.getTime())) {
        qb.andWhere('checkout.occurredAt >= :fromAt', { fromAt });
      }
    }

    if (query.toAt) {
      const toAt = new Date(query.toAt);
      if (!Number.isNaN(toAt.getTime())) {
        qb.andWhere('checkout.occurredAt <= :toAt', { toAt });
      }
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((item) => this.toListItem(item)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async findOne(id: number, branchId: number): Promise<PosCheckoutResponseDto> {
    const checkout = await this.findOneById(id);

    if (checkout.branchId !== branchId) {
      throw new BadRequestException(
        `POS checkout ${id} does not belong to branch ${branchId}`,
      );
    }

    return this.toResponse(checkout);
  }

  async ingest(
    dto: IngestPosCheckoutDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<PosCheckoutResponseDto> {
    if (!dto.items.length) {
      throw new BadRequestException(
        'POS checkout ingestion requires at least one item',
      );
    }

    if (
      dto.transactionType === PosCheckoutTransactionType.RETURN &&
      !this.normalizeOptionalString(dto.sourceReceiptNumber)
    ) {
      throw new BadRequestException(
        'POS return ingestion requires sourceReceiptNumber',
      );
    }

    this.assertPricingSummary(dto.pricingSummary, dto);

    const existing = await this.findExistingForIdempotency(dto);
    if (existing) {
      return this.toResponse(existing);
    }

    await this.assertScope(dto.branchId, dto.partnerCredentialId);

    // Authoritative sale time — independent of the device clock (server time for
    // online captures; clamped device time for offline captures).
    const occurredAt = this.resolveOccurredAt(dto.occurredAt, dto.captureState);

    const checkout = await this.posCheckoutsRepository.save(
      this.posCheckoutsRepository.create({
        branchId: dto.branchId,
        partnerCredentialId: dto.partnerCredentialId ?? null,
        externalCheckoutId: this.normalizeOptionalString(
          dto.externalCheckoutId,
        ),
        idempotencyKey: this.normalizeOptionalString(dto.idempotencyKey),
        registerId: this.normalizeOptionalString(dto.registerId),
        registerSessionId: dto.registerSessionId ?? null,
        suspendedCartId: dto.suspendedCartId ?? null,
        receiptNumber: this.normalizeOptionalString(dto.receiptNumber),
        transactionType: dto.transactionType,
        status: PosCheckoutStatus.RECEIVED,
        currency: dto.currency.trim().toUpperCase(),
        subtotal: dto.subtotal,
        discountAmount: dto.discountAmount ?? 0,
        taxAmount: dto.taxAmount ?? 0,
        total: dto.total,
        paidAmount: dto.paidAmount ?? 0,
        changeDue: dto.changeDue ?? 0,
        tipAmount: dto.tipAmount ?? 0,
        itemCount: dto.items.length,
        occurredAt,
        cashierUserId: dto.cashierUserId ?? actor.id ?? null,
        cashierName: this.normalizeOptionalString(dto.cashierName),
        note: this.normalizeOptionalString(dto.note),
        failureReason: null,
        metadata: this.buildCheckoutMetadata(dto),
        tenders: dto.tenders ?? [],
        items: dto.items.map((item) => ({
          ...item,
          aliasValue: this.normalizeOptionalString(item.aliasValue),
          sku: this.normalizeOptionalString(item.sku),
          title: this.normalizeOptionalString(item.title),
          note: this.normalizeOptionalString(item.note),
          reasonCode: this.normalizeOptionalString(item.reasonCode),
          discountAmount: item.discountAmount ?? 0,
          taxRate: item.taxRate ?? null,
          taxableBase: item.taxableBase ?? null,
          taxAmount: item.taxAmount ?? 0,
          metadata: this.normalizeCheckoutItemMetadata(item.metadata),
        })),
      }),
    );

    try {
      await this.dataSource.transaction(async (manager) => {
        const registerSession = await this.assertRegisterSession(dto, manager);
        const suspendedCart = await this.assertSuspendedCart(
          dto,
          registerSession,
          manager,
        );

        await this.assertReturnSourceSaleProcessed(dto, manager);

        if (registerSession && !checkout.registerId) {
          checkout.registerId = registerSession.registerId;
        }
        if (registerSession && checkout.registerSessionId == null) {
          checkout.registerSessionId = registerSession.id;
        }
        if (suspendedCart && checkout.suspendedCartId == null) {
          checkout.suspendedCartId = suspendedCart.id;
        }

        for (const item of dto.items) {
          const productId = await this.resolveProductId(
            dto.branchId,
            dto.partnerCredentialId,
            item,
          );
          const quantity = Math.abs(item.quantity);
          const movementType =
            dto.transactionType === PosCheckoutTransactionType.SALE
              ? StockMovementType.SALE
              : StockMovementType.ADJUSTMENT;
          const quantityDelta =
            dto.transactionType === PosCheckoutTransactionType.SALE
              ? -quantity
              : quantity;

          // RETAIL variant line: decrement the specific variant's stock, which
          // cascades to the product-level rollup. Runs BEFORE the manageStock
          // gate because variant products are stock-tracked at the variant level
          // even when the product-level manageStock flag is false.
          const variantId = await this.resolveCheckoutVariantId(
            productId,
            item.metadata,
            manager,
          );
          if (variantId) {
            await this.variantInventoryService.recordVariantMovement(
              {
                branchId: dto.branchId,
                productId,
                variantId,
                quantityDelta,
                movementType,
                sourceType: 'POS_CHECKOUT',
                sourceReferenceId: checkout.id,
                actorUserId: actor.id ?? null,
                note: this.buildMovementNote(dto, item),
                occurredAt,
              },
              manager,
            );
            continue;
          }

          // Only deduct inventory for products that explicitly opt in to stock
          // management. Products with manageStock = false (the default) are
          // treated as always-available (e.g. made-to-order food items) and
          // must not be deducted — doing so would immediately fail because they
          // have no inventory record (onHand starts at 0).
          const product = await manager.getRepository(Product).findOne({
            where: { id: productId },
            select: ['id', 'manageStock'],
          });

          if (!product?.manageStock) {
            continue;
          }

          await this.inventoryLedgerService.recordMovement(
            {
              branchId: dto.branchId,
              productId,
              movementType,
              quantityDelta,
              sourceType: 'POS_CHECKOUT',
              sourceReferenceId: checkout.id,
              actorUserId: actor.id ?? null,
              note: this.buildMovementNote(dto, item),
              occurredAt,
            },
            manager,
          );
        }

        checkout.status = PosCheckoutStatus.PROCESSED;
        checkout.processedAt = new Date();
        checkout.failureReason = null;

        if (suspendedCart) {
          suspendedCart.status = PosSuspendedCartStatus.RESUMED;
          suspendedCart.resumedAt = new Date();
          suspendedCart.resumedByUserId = actor.id ?? null;
          suspendedCart.resumedByName = actor.email ?? null;
          suspendedCart.metadata = {
            ...(suspendedCart.metadata ?? {}),
            consumedByCheckoutId: checkout.id,
          };
          await manager.getRepository(PosSuspendedCart).save(suspendedCart);
        }

        await manager.getRepository(PosCheckout).save(checkout);
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown POS checkout error';

      await this.posCheckoutsRepository.save({
        ...checkout,
        status: PosCheckoutStatus.FAILED,
        processedAt: new Date(),
        failureReason: message,
      });

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        return this.toResponse(await this.findOneById(checkout.id));
      }

      throw error;
    }

    const processed = await this.findOneById(checkout.id);

    // Post the sale to the general ledger (best-effort — the checkout is the
    // source of truth; a ledger hiccup must never fail a sale, and the
    // reconciliation harness in a later phase detects any gaps).
    await this.postCheckoutToLedger(processed).catch((error) => {
      this.logger.warn(
        `GL posting failed for checkout ${checkout.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    });

    // Fire receipt email to customer if email is available
    const customerEmail =
      (checkout.metadata as any)?.customerProfile?.email ||
      (checkout.metadata as any)?.customer?.email;
    if (customerEmail) {
      void (async () => {
        try {
          const branch = await this.branchesRepository.findOne({
            where: { id: checkout.branchId },
          });
          const items = (checkout.items ?? []).map((item) => ({
            name: item.title || `Product #${item.productId ?? '?'}`,
            qty: item.quantity,
            price: item.unitPrice,
            total: item.lineTotal,
          }));
          const tenders = (checkout.tenders ?? []).map((t) => ({
            method: t.method,
            amount: t.amount,
          }));
          await this.emailService.sendPosReceiptEmail(customerEmail, {
            receiptNumber: checkout.receiptNumber || String(checkout.id),
            branchName: branch?.name || 'SUUQ POS',
            branchAddress: branch?.address ?? null,
            branchPhone: (branch as any)?.phone ?? null,
            items,
            subtotal: checkout.subtotal,
            total: checkout.total,
            currency: checkout.currency,
            date: checkout.processedAt ?? new Date(),
            tenders,
          });
        } catch (err: any) {
          // Non-fatal — log and continue
          console.warn(
            `[PosCheckout] Receipt email failed for checkout ${checkout.id}: ${err?.message}`,
          );
        }
      })();
    }

    return this.toResponse(processed);
  }

  /**
   * Resolve a sale line's product variant from its metadata (variantId or
   * variantKey), scoped to the line's product. Returns null for non-variant
   * lines so checkout falls through to the product-level decrement.
   */
  private async resolveCheckoutVariantId(
    productId: number,
    metadata: Record<string, any> | null | undefined,
    manager: EntityManager,
  ): Promise<number | null> {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }
    const repo = manager.getRepository(ProductVariant);
    const rawId = Number(metadata.variantId);
    if (Number.isFinite(rawId) && rawId > 0) {
      const byId = await repo.findOne({ where: { id: rawId, productId } });
      if (byId) {
        return byId.id;
      }
    }
    const variantKey =
      typeof metadata.variantKey === 'string' ? metadata.variantKey.trim() : '';
    if (variantKey) {
      const byKey = await repo.findOne({ where: { productId, variantKey } });
      if (byKey) {
        return byKey.id;
      }
    }
    return null;
  }

  private async resolveProductId(
    branchId: number,
    partnerCredentialId: number | undefined,
    item: PosCheckoutItemDto,
  ): Promise<number> {
    if (item.productId != null) {
      return item.productId;
    }

    if (!item.aliasType || !item.aliasValue?.trim()) {
      throw new BadRequestException(
        'Each POS checkout item requires productId or aliasType plus aliasValue',
      );
    }

    const productId =
      await this.productAliasesService.resolveProductIdForBranch(
        branchId,
        partnerCredentialId,
        item.aliasType,
        item.aliasValue,
      );

    if (productId == null) {
      throw new BadRequestException(
        `No product alias matched ${item.aliasType}:${item.aliasValue}`,
      );
    }

    return productId;
  }

  private async resolveQuoteLine(
    branchId: number,
    item: QuotePosCheckoutItemDto,
  ): Promise<ResolvedQuoteLineInput> {
    let resolvedProductId = item.productId ?? null;

    if (
      resolvedProductId == null &&
      item.aliasType &&
      this.normalizeOptionalString(item.aliasValue)
    ) {
      resolvedProductId =
        await this.productAliasesService.resolveProductIdForBranch(
          branchId,
          undefined,
          item.aliasType,
          item.aliasValue,
        );
    }

    const product = resolvedProductId
      ? await this.productsRepository.findOne({
          where: { id: resolvedProductId },
          relations: { category: true },
        })
      : null;

    if (resolvedProductId != null && !product) {
      throw new NotFoundException(
        `Product with ID ${resolvedProductId} not found`,
      );
    }

    const unitPrice = this.roundMoney(
      Number(product?.salePrice ?? product?.price ?? item.unitPrice ?? 0),
    );

    return {
      lineId: this.normalizeOptionalString(item.lineId),
      productId: resolvedProductId,
      sku: this.normalizeOptionalString(item.sku ?? product?.sku) ?? null,
      title: this.normalizeOptionalString(item.title ?? product?.name) ?? null,
      category:
        this.normalizeOptionalString(
          item.category ?? product?.category?.name,
        ) ?? null,
      currency:
        this.normalizeOptionalString(item.currency ?? product?.currency) ??
        'ETB',
      metadata: this.normalizeCheckoutItemMetadata(item.metadata),
      taxRate: Number(item.taxRate ?? 0),
      unitPrice,
      quantity: Math.max(0.000001, Number(item.quantity || 0)),
    };
  }

  private async assertScope(
    branchId: number,
    partnerCredentialId?: number,
  ): Promise<void> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${branchId} not found`);
    }

    if (partnerCredentialId == null) {
      return;
    }

    const partnerCredential = await this.partnerCredentialsRepository.findOne({
      where: { id: partnerCredentialId },
    });
    if (!partnerCredential) {
      throw new NotFoundException(
        `Partner credential with ID ${partnerCredentialId} not found`,
      );
    }

    if (
      partnerCredential.branchId != null &&
      partnerCredential.branchId !== branchId
    ) {
      throw new BadRequestException(
        `Partner credential ${partnerCredentialId} is not bound to branch ${branchId}`,
      );
    }
  }

  private buildQuoteResponse(
    dto: QuotePosCheckoutDto,
    resolvedLines: ResolvedQuoteLineInput[],
  ): PosCheckoutQuoteResponseDto {
    const customerPricingRule = this.getCustomerPricingRule(
      dto.customerProfile?.customerType,
    );
    const baseLines = resolvedLines.map((line) => ({
      ...line,
      grossSubtotal: this.roundMoney(line.unitPrice * line.quantity),
      customerTypeDiscount:
        customerPricingRule.discountRate > 0 &&
        this.isFoodServiceQuoteLine(line)
          ? this.roundMoney(
              this.roundMoney(line.unitPrice * line.quantity) *
                customerPricingRule.discountRate,
            )
          : 0,
      automaticDiscount: 0,
      promoCodeDiscount: 0,
      taxableBase: 0,
      taxAmount: 0,
      total: 0,
      promotionLabels: [] as string[],
    }));

    const customerTypeDiscount = this.roundMoney(
      baseLines.reduce((sum, line) => sum + line.customerTypeDiscount, 0),
    );

    const automaticPromotions = this.buildAutomaticPromotions(baseLines);
    const automaticDiscount = this.roundMoney(
      automaticPromotions.reduce((sum, promotion) => sum + promotion.amount, 0),
    );

    const linesAfterAutomatic = baseLines.map((line) => {
      const matchingPromotions = automaticPromotions.filter(
        (promotion) => promotion.lineId === line.lineId,
      );
      const lineAutomaticDiscount = this.roundMoney(
        matchingPromotions.reduce(
          (sum, promotion) => sum + promotion.amount,
          0,
        ),
      );

      return {
        ...line,
        automaticDiscount: lineAutomaticDiscount,
        promotionLabels: matchingPromotions.map((promotion) => promotion.label),
      };
    });

    const subtotal = this.roundMoney(
      baseLines.reduce((sum, line) => sum + line.grossSubtotal, 0),
    );
    const subtotalAfterAutomatic = this.roundMoney(
      subtotal - customerTypeDiscount - automaticDiscount,
    );
    const { promoCode, promoCodeError } = this.resolvePromoCode(
      dto.promoCode,
      subtotalAfterAutomatic,
    );
    const promoCodeDiscountTotal = promoCode
      ? this.roundMoney(subtotalAfterAutomatic * promoCode.percentage)
      : 0;
    const safeSubtotalAfterAutomatic =
      subtotalAfterAutomatic > 0 ? subtotalAfterAutomatic : 1;

    const lines = linesAfterAutomatic.map((line, index) => {
      let promoCodeDiscount = 0;

      if (promoCodeDiscountTotal > 0) {
        if (index === linesAfterAutomatic.length - 1) {
          const allocatedSoFar = linesAfterAutomatic
            .slice(0, index)
            .reduce(
              (sum, candidate) =>
                sum +
                this.roundMoney(
                  ((candidate.grossSubtotal -
                    candidate.customerTypeDiscount -
                    candidate.automaticDiscount) /
                    safeSubtotalAfterAutomatic) *
                    promoCodeDiscountTotal,
                ),
              0,
            );
          promoCodeDiscount = this.roundMoney(
            promoCodeDiscountTotal - allocatedSoFar,
          );
        } else {
          promoCodeDiscount = this.roundMoney(
            ((line.grossSubtotal -
              line.customerTypeDiscount -
              line.automaticDiscount) /
              safeSubtotalAfterAutomatic) *
              promoCodeDiscountTotal,
          );
        }
      }

      const taxableBase = this.roundMoney(
        line.grossSubtotal -
          line.customerTypeDiscount -
          line.automaticDiscount -
          promoCodeDiscount,
      );
      const taxAmount = this.roundMoney(taxableBase * line.taxRate);

      return {
        ...line,
        promoCodeDiscount,
        taxableBase,
        taxAmount,
        total: this.roundMoney(taxableBase + taxAmount),
      };
    });

    const discountTotal = this.roundMoney(
      customerTypeDiscount + automaticDiscount + promoCodeDiscountTotal,
    );
    const netSubtotal = this.roundMoney(subtotal - discountTotal);
    const taxTotal = this.roundMoney(
      lines.reduce((sum, line) => sum + line.taxAmount, 0),
    );
    const grandTotal = this.roundMoney(netSubtotal + taxTotal);

    return {
      branchId: dto.branchId,
      transactionType: dto.transactionType,
      currency: lines[0]?.currency || 'ETB',
      lines,
      subtotal,
      customerTypeDiscount,
      automaticDiscount,
      promoCodeDiscount: promoCodeDiscountTotal,
      discountTotal,
      netSubtotal,
      taxTotal,
      grandTotal,
      totalItems: lines.reduce((sum, line) => sum + line.quantity, 0),
      promoCode,
      customerPricingRule,
      promoCodeError,
      pricingSource: 'BACKEND_QUOTE',
    };
  }

  private buildAutomaticPromotions(lines: Array<QuoteLine>) {
    return lines.reduce<
      Array<{ lineId?: string | null; amount: number; label: string }>
    >((promotions, line) => {
      let discount = 0;
      let label = '';
      const promotionBaseSubtotal = this.roundMoney(
        line.grossSubtotal - line.customerTypeDiscount,
      );
      const promotionUnitPrice =
        line.quantity > 0
          ? this.roundMoney(promotionBaseSubtotal / line.quantity)
          : line.unitPrice;

      if (line.category === 'SNACK' && line.quantity >= 3) {
        discount += promotionBaseSubtotal * 0.1;
        label = '10% snack volume discount';
      }

      if (line.sku === 'WATER-600' && line.quantity >= 4) {
        discount += promotionUnitPrice;
        label = label ? `${label} + water basket bonus` : 'Water basket bonus';
      }

      if (discount <= 0) {
        return promotions;
      }

      promotions.push({
        lineId: line.lineId,
        amount: this.roundMoney(discount),
        label,
      });
      return promotions;
    }, []);
  }

  private getCustomerPricingRule(
    customerType?: string | null,
  ): PosCustomerPricingRule {
    const normalizedCustomerType = String(customerType || '')
      .trim()
      .toUpperCase();

    return (
      POS_CUSTOMER_PRICING_RULES[
        normalizedCustomerType as keyof typeof POS_CUSTOMER_PRICING_RULES
      ] ?? POS_CUSTOMER_PRICING_RULES.PUBLIC
    );
  }

  private isFoodServiceQuoteLine(line: ResolvedQuoteLineInput): boolean {
    const serviceFormat = String(line.metadata?.serviceFormat || '')
      .trim()
      .toUpperCase();
    const category = String(line.category || '')
      .trim()
      .toUpperCase();

    return category === 'FOOD_SERVICE' || serviceFormat === 'HOTEL';
  }

  private resolvePromoCode(code?: string | null, subtotal = 0) {
    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase();

    if (!normalizedCode) {
      return { promoCode: null, promoCodeError: '' };
    }

    const promoCode =
      POS_PROMO_CODES[normalizedCode as keyof typeof POS_PROMO_CODES] ?? null;
    if (!promoCode) {
      return {
        promoCode: null,
        promoCodeError: 'Promo code is not recognized.',
      };
    }

    if (subtotal < promoCode.minSubtotal) {
      return {
        promoCode: null,
        promoCodeError: `${promoCode.code} requires a subtotal of ${promoCode.minSubtotal.toFixed(0)} or more.`,
      };
    }

    return { promoCode, promoCodeError: '' };
  }

  private async assertRegisterSession(
    dto: IngestPosCheckoutDto,
    manager: DataSource['manager'],
  ): Promise<PosRegisterSession | null> {
    if (dto.registerSessionId == null) {
      return null;
    }

    const session = await manager.getRepository(PosRegisterSession).findOne({
      where: { id: dto.registerSessionId },
    });
    if (!session) {
      throw new NotFoundException(
        `Register session ${dto.registerSessionId} not found`,
      );
    }
    if (session.branchId !== dto.branchId) {
      throw new BadRequestException(
        `Register session ${dto.registerSessionId} does not belong to branch ${dto.branchId}`,
      );
    }
    if (session.status !== PosRegisterSessionStatus.OPEN) {
      throw new BadRequestException(
        `Register session ${dto.registerSessionId} is not open`,
      );
    }
    if (dto.registerId && session.registerId !== dto.registerId.trim()) {
      throw new BadRequestException(
        `Register session ${dto.registerSessionId} is not bound to register ${dto.registerId}`,
      );
    }

    return session;
  }

  private async assertSuspendedCart(
    dto: IngestPosCheckoutDto,
    registerSession: PosRegisterSession | null,
    manager: DataSource['manager'],
  ): Promise<PosSuspendedCart | null> {
    if (dto.suspendedCartId == null) {
      return null;
    }

    if (dto.transactionType !== PosCheckoutTransactionType.SALE) {
      throw new BadRequestException(
        'Suspended carts can only be consumed by sale checkouts',
      );
    }

    const cart = await manager.getRepository(PosSuspendedCart).findOne({
      where: { id: dto.suspendedCartId },
    });
    if (!cart) {
      throw new NotFoundException(
        `Suspended cart ${dto.suspendedCartId} not found`,
      );
    }
    if (cart.branchId !== dto.branchId) {
      throw new BadRequestException(
        `Suspended cart ${dto.suspendedCartId} does not belong to branch ${dto.branchId}`,
      );
    }
    if (cart.status !== PosSuspendedCartStatus.SUSPENDED) {
      throw new BadRequestException(
        `Suspended cart ${dto.suspendedCartId} is not available for checkout`,
      );
    }
    if (
      registerSession &&
      cart.registerSessionId != null &&
      cart.registerSessionId !== registerSession.id
    ) {
      throw new BadRequestException(
        `Suspended cart ${dto.suspendedCartId} is not linked to register session ${registerSession.id}`,
      );
    }
    if (
      dto.registerId &&
      cart.registerId != null &&
      cart.registerId !== dto.registerId.trim()
    ) {
      throw new BadRequestException(
        `Suspended cart ${dto.suspendedCartId} is not linked to register ${dto.registerId}`,
      );
    }

    return cart;
  }

  private async findExistingForIdempotency(
    dto: IngestPosCheckoutDto,
  ): Promise<PosCheckout | null> {
    const idempotencyKey = this.normalizeOptionalString(dto.idempotencyKey);
    if (idempotencyKey) {
      return this.posCheckoutsRepository.findOne({
        where: {
          branchId: dto.branchId,
          idempotencyKey,
        },
      });
    }

    const externalCheckoutId = this.normalizeOptionalString(
      dto.externalCheckoutId,
    );
    if (externalCheckoutId) {
      return this.posCheckoutsRepository.findOne({
        where: {
          branchId: dto.branchId,
          externalCheckoutId,
        },
      });
    }

    return null;
  }

  private async findOneById(id: number): Promise<PosCheckout> {
    const checkout = await this.posCheckoutsRepository.findOne({
      where: { id },
    });

    if (!checkout) {
      throw new NotFoundException(`POS checkout with ID ${id} not found`);
    }

    return checkout;
  }

  private round2(value: number): number {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  /** Deterministic GL idempotency key for a checkout (stable across retries). */
  private ledgerKeyForCheckout(checkout: PosCheckout): string {
    return checkout.idempotencyKey
      ? `pos-checkout-${checkout.idempotencyKey}`
      : `pos-checkout-${checkout.id}`;
  }

  private resolveRevenueAccount(account?: string): GlAccountCode {
    return account === 'RENTAL_REVENUE'
      ? GlAccountCode.RENTAL_REVENUE
      : GlAccountCode.SERVICE_REVENUE;
  }

  /**
   * Post a cash-basis POS sale/return to the general ledger from the
   * `financialClassification` block pos-s attaches to the checkout.
   *
   * Scope (this phase): cash-basis formats only. ACCRUAL formats
   * (HOTEL/PROPERTY_RENTAL) and COGS/inventory postings are intentionally
   * deferred to the hospitality + inventory sub-ledger phase, so we don't
   * double-count folio/booking revenue or post inventory relief without the
   * matching purchase-order receipts.
   *
   * The entry balances by construction: debits (cash + tender clearing +
   * receivable) sum to `total`, and credits (revenue net of tax + tax payable)
   * also sum to `total`. A RETURN posts the mirror of a SALE.
   */
  private async postCheckoutToLedger(checkout: PosCheckout): Promise<void> {
    const fc = (checkout.metadata as any)?.financialClassification;
    if (!fc) {
      return; // additive: only post when pos-s sent the classification block
    }
    const isAccrual =
      String(fc.recognitionBasis || '').toUpperCase() === 'ACCRUAL';
    if (isAccrual) {
      return; // deferred to the hospitality phase to avoid double-counting
    }

    const isReturn =
      checkout.transactionType === PosCheckoutTransactionType.RETURN;
    const total = this.round2(Number(checkout.total || 0));
    const paid = this.round2(Number(checkout.paidAmount || 0));
    const tax = this.round2(Number(checkout.taxAmount || 0));
    // Net revenue = total minus tax; computed here (not trusted from the block)
    // so the entry always balances against total.
    const revenue = this.round2(total - tax);
    // Cash actually retained excludes any change handed back, so debits reconcile
    // to `total` even when the tender exceeds the bill (offline/legacy receipts,
    // non-RETAIL formats, or API clients may still carry a changeDue).
    const netCash = Math.max(
      0,
      this.round2(paid - this.round2(Number(checkout.changeDue || 0))),
    );
    const receivable = Math.max(0, this.round2(total - netCash));
    if (total <= 0) {
      return;
    }

    // Split the retained tender between cash on hand and clearing (cards/mobile/
    // bank), reconciled to netCash, via the shared helper.
    const { cash, clearing } = splitTenders(
      Array.isArray(checkout.tenders) ? checkout.tenders : [],
      netCash,
    );

    const debits: JournalLineInput[] = [];
    const credits: JournalLineInput[] = [];
    if (cash > 0) debits.push({ accountCode: GlAccountCode.CASH, debit: cash });
    if (clearing > 0)
      debits.push({
        accountCode: GlAccountCode.TENDER_CLEARING,
        debit: clearing,
      });
    if (receivable > 0)
      debits.push({
        accountCode: GlAccountCode.ACCOUNTS_RECEIVABLE,
        debit: receivable,
      });
    if (revenue > 0)
      credits.push({
        accountCode: this.resolveRevenueAccount(fc.revenue?.account),
        credit: revenue,
      });
    if (tax > 0)
      credits.push({ accountCode: GlAccountCode.TAX_PAYABLE, credit: tax });

    let lines: JournalLineInput[] = [...debits, ...credits];
    if (isReturn) {
      // A return reverses the sale: swap every debit and credit.
      lines = lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.credit ?? 0,
        credit: line.debit ?? 0,
      }));
    }
    if (lines.length < 2) {
      return;
    }

    await this.generalLedger.post({
      branchId: checkout.branchId,
      occurredAt: checkout.occurredAt,
      sourceType: isReturn
        ? GlJournalSourceType.POS_RETURN
        : GlJournalSourceType.POS_CHECKOUT,
      sourceId: checkout.receiptNumber || String(checkout.id),
      idempotencyKey: this.ledgerKeyForCheckout(checkout),
      currency: checkout.currency,
      memo: `${isReturn ? 'POS return' : 'POS sale'} ${
        checkout.receiptNumber ?? checkout.id
      }`,
      createdByUserId: checkout.cashierUserId ?? null,
      lines,
    });

    // Relieve inventory at weighted-average cost for inventory-backed formats.
    if (String(fc.cogsSource || '').toUpperCase() === 'INVENTORY') {
      await this.postCheckoutCogs(checkout, isReturn);
    }
  }

  /**
   * Post the cost-of-goods-sold relief for an inventory sale:
   * SALE → Dr COGS / Cr Inventory; RETURN → Dr Inventory / Cr COGS. Costed at
   * the per-product weighted-average from purchase history. Best-effort and
   * idempotent; skipped when no costed quantity is present.
   */
  private async postCheckoutCogs(
    checkout: PosCheckout,
    isReturn: boolean,
  ): Promise<void> {
    const items = Array.isArray(checkout.items) ? checkout.items : [];
    const productIds = items
      .map((item) => Number((item as any)?.productId))
      .filter((id) => Number.isFinite(id));
    if (!productIds.length) return;

    const costs = await this.productCost.weightedAverageCosts(
      checkout.branchId,
      productIds,
    );
    let totalCost = 0;
    for (const item of items) {
      const productId = Number((item as any)?.productId);
      const unitCost = costs.get(productId);
      if (!unitCost) continue;
      totalCost += unitCost * Math.abs(Number((item as any)?.quantity || 0));
    }
    totalCost = this.round2(totalCost);
    if (totalCost <= 0) return;

    // SALE relieves inventory into COGS; a RETURN puts the goods back.
    const lines: JournalLineInput[] = isReturn
      ? [
          { accountCode: GlAccountCode.INVENTORY, debit: totalCost },
          { accountCode: GlAccountCode.COGS, credit: totalCost },
        ]
      : [
          { accountCode: GlAccountCode.COGS, debit: totalCost },
          { accountCode: GlAccountCode.INVENTORY, credit: totalCost },
        ];

    await this.generalLedger.post({
      branchId: checkout.branchId,
      occurredAt: checkout.occurredAt,
      sourceType: isReturn
        ? GlJournalSourceType.POS_RETURN
        : GlJournalSourceType.POS_CHECKOUT,
      sourceId: checkout.receiptNumber || String(checkout.id),
      idempotencyKey: `pos-cogs-${this.ledgerKeyForCheckout(checkout)}`,
      currency: checkout.currency,
      memo: `COGS — ${checkout.receiptNumber ?? checkout.id}`,
      lines,
    });
  }

  /**
   * Record a customer paying down an OPEN accounts-receivable balance after the
   * original sale. Posts `Dr Cash/Tender clearing / Cr Accounts receivable`.
   * Idempotent on the client-supplied key, so a retried pay-down is a no-op.
   */
  async settleReceivable(
    dto: SettleReceivableDto,
    actor: { id?: number | null } = {},
  ): Promise<{ posted: boolean; entryId: number; idempotencyKey: string }> {
    const settled = this.round2(Number(dto.settledAmount || 0));
    if (settled <= 0) {
      throw new BadRequestException('settledAmount must be greater than zero.');
    }

    const tenders = Array.isArray(dto.tenders) ? dto.tenders : [];
    let cash = 0;
    let clearing = 0;
    for (const tender of tenders) {
      const amount = Number(tender?.amount || 0);
      if (String(tender?.method || '').toUpperCase() === 'CASH') {
        cash += amount;
      } else {
        clearing += amount;
      }
    }
    if (this.round2(cash + clearing) <= 0) {
      cash = settled; // no tender detail — treat the whole pay-down as cash
    }
    const tenderSum = this.round2(cash + clearing);
    if (tenderSum !== settled) {
      const scale = settled / tenderSum;
      cash = this.round2(cash * scale);
      clearing = this.round2(settled - cash);
    }

    const debits: JournalLineInput[] = [];
    if (cash > 0) debits.push({ accountCode: GlAccountCode.CASH, debit: cash });
    if (clearing > 0)
      debits.push({
        accountCode: GlAccountCode.TENDER_CLEARING,
        debit: clearing,
      });

    const occurredAt = dto.settledAt ? new Date(dto.settledAt) : new Date();
    const entry = await this.generalLedger.post({
      branchId: dto.branchId,
      occurredAt,
      sourceType: GlJournalSourceType.AR_SETTLEMENT,
      sourceId: dto.originalReceiptNumber || null,
      idempotencyKey: dto.idempotencyKey,
      currency: (dto.currency || 'ETB').trim().toUpperCase(),
      memo: `Receivable settlement for ${dto.originalReceiptNumber ?? ''}`.trim(),
      createdByUserId: actor.id ?? null,
      lines: [
        ...debits,
        { accountCode: GlAccountCode.ACCOUNTS_RECEIVABLE, credit: settled },
      ],
    });

    return {
      posted: true,
      entryId: entry.id,
      idempotencyKey: dto.idempotencyKey,
    };
  }

  private buildCheckoutMetadata(
    dto: IngestPosCheckoutDto,
  ): Record<string, any> | null {
    const baseMetadata = { ...(dto.metadata ?? {}) };
    const sourceReceiptId = this.normalizeOptionalString(dto.sourceReceiptId);
    const sourceReceiptNumber = this.normalizeOptionalString(
      dto.sourceReceiptNumber,
    );
    const refundMethod = this.normalizeOptionalString(dto.refundMethod);

    if (sourceReceiptId || sourceReceiptNumber || refundMethod) {
      baseMetadata.returnContext = {
        ...(baseMetadata.returnContext ?? {}),
        sourceReceiptId,
        sourceReceiptNumber,
        refundMethod,
      };
    }

    if (dto.pricingSummary && Object.keys(dto.pricingSummary).length > 0) {
      baseMetadata.pricingSummary = dto.pricingSummary;
    }

    if (dto.customerProfile && Object.keys(dto.customerProfile).length > 0) {
      baseMetadata.customerProfile = dto.customerProfile;
    }

    if (dto.loyaltySummary && Object.keys(dto.loyaltySummary).length > 0) {
      baseMetadata.loyaltySummary = dto.loyaltySummary;
    }

    if (
      dto.financialClassification &&
      Object.keys(dto.financialClassification).length > 0
    ) {
      baseMetadata.financialClassification = dto.financialClassification;
    }

    return Object.keys(baseMetadata).length ? baseMetadata : null;
  }

  private async assertReturnSourceSaleProcessed(
    dto: IngestPosCheckoutDto,
    manager: EntityManager,
  ): Promise<void> {
    if (dto.transactionType !== PosCheckoutTransactionType.RETURN) {
      return;
    }

    const sourceReceiptNumber = this.normalizeOptionalString(
      dto.sourceReceiptNumber,
    );

    if (!sourceReceiptNumber) {
      return;
    }

    const checkoutRepository = manager.getRepository(PosCheckout);

    const processedSourceSale = await checkoutRepository.findOne({
      where: {
        branchId: dto.branchId,
        receiptNumber: sourceReceiptNumber,
        transactionType: PosCheckoutTransactionType.SALE,
        status: PosCheckoutStatus.PROCESSED,
      },
    });

    if (processedSourceSale) {
      return;
    }

    const sourceSale = await checkoutRepository.findOne({
      where: {
        branchId: dto.branchId,
        receiptNumber: sourceReceiptNumber,
        transactionType: PosCheckoutTransactionType.SALE,
      },
    });

    if (!sourceSale) {
      throw new BadRequestException(
        `Return source sale ${sourceReceiptNumber} was not found in checkout history`,
      );
    }

    throw new BadRequestException(
      `Return source sale ${sourceReceiptNumber} is ${sourceSale.status} and cannot be returned until it is PROCESSED`,
    );
  }

  private normalizeCheckoutItemMetadata(
    metadata?: Record<string, any> | null,
  ): Record<string, any> | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const normalized: Record<string, any> = { ...metadata };

    for (const key of NORMALIZED_CHECKOUT_ITEM_METADATA_KEYS) {
      const value = this.normalizeOptionalString(metadata[key]);
      normalized[key] = value ? value.toUpperCase() : null;
    }

    for (const key of NORMALIZED_CHECKOUT_ITEM_LABEL_KEYS) {
      normalized[key] = this.normalizeOptionalString(metadata[key]);
    }

    if (metadata.guestCount != null) {
      const guestCount = Number(metadata.guestCount);
      normalized.guestCount =
        Number.isFinite(guestCount) && guestCount > 0 ? guestCount : null;
    }

    return Object.keys(normalized).some((key) => normalized[key] != null)
      ? normalized
      : null;
  }

  private assertPricingSummary(
    pricingSummary: Record<string, any> | undefined,
    dto: IngestPosCheckoutDto,
  ): void {
    if (!pricingSummary) {
      return;
    }

    const quotedGrandTotal = Number(pricingSummary.grandTotal);
    const quotedTaxTotal = Number(pricingSummary.taxTotal);
    const quotedDiscountTotal = Number(pricingSummary.discountTotal);

    if (
      Number.isFinite(quotedGrandTotal) &&
      Math.abs(this.roundMoney(quotedGrandTotal) - this.roundMoney(dto.total)) >
        0.01
    ) {
      throw new BadRequestException(
        'Checkout total does not match the supplied pricing summary',
      );
    }

    if (
      Number.isFinite(quotedTaxTotal) &&
      Math.abs(
        this.roundMoney(quotedTaxTotal) - this.roundMoney(dto.taxAmount ?? 0),
      ) > 0.01
    ) {
      throw new BadRequestException(
        'Checkout tax amount does not match the supplied pricing summary',
      );
    }

    if (
      Number.isFinite(quotedDiscountTotal) &&
      Math.abs(
        this.roundMoney(quotedDiscountTotal) -
          this.roundMoney(dto.discountAmount ?? 0),
      ) > 0.01
    ) {
      throw new BadRequestException(
        'Checkout discount amount does not match the supplied pricing summary',
      );
    }
  }

  private buildMovementNote(
    dto: IngestPosCheckoutDto,
    item: PosCheckoutItemDto,
  ): string {
    const receiptNumber = this.normalizeOptionalString(dto.receiptNumber);
    const itemNote = this.normalizeOptionalString(item.note);
    const prefix =
      dto.transactionType === PosCheckoutTransactionType.SALE
        ? 'POS checkout sale'
        : 'POS checkout return';

    if (receiptNumber && itemNote) {
      return `${prefix} ${receiptNumber} | ${itemNote}`;
    }
    if (receiptNumber) {
      return `${prefix} ${receiptNumber}`;
    }
    if (itemNote) {
      return `${prefix} | ${itemNote}`;
    }
    return prefix;
  }

  private normalizeOptionalString(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private roundMoney(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  private extractReturnContext(checkout: PosCheckout) {
    return checkout.metadata?.returnContext ?? null;
  }

  private extractPricingSummary(checkout: PosCheckout) {
    return checkout.metadata?.pricingSummary ?? null;
  }

  private extractCustomerProfile(checkout: PosCheckout) {
    return checkout.metadata?.customerProfile ?? null;
  }

  private extractLoyaltySummary(checkout: PosCheckout) {
    return checkout.metadata?.loyaltySummary ?? null;
  }

  async getTaxSummary(
    query: TaxSummaryQueryDto,
  ): Promise<TaxSummaryResponseDto> {
    const qb = this.posCheckoutsRepository
      .createQueryBuilder('checkout')
      .where('checkout.branchId = :branchId', { branchId: query.branchId })
      .andWhere('checkout.status = :status', {
        status: PosCheckoutStatus.PROCESSED,
      });

    if (query.fromAt) {
      const fromAt = new Date(query.fromAt);
      if (!Number.isNaN(fromAt.getTime())) {
        qb.andWhere('checkout.occurredAt >= :fromAt', { fromAt });
      }
    }
    if (query.toAt) {
      const toAt = new Date(query.toAt);
      if (!Number.isNaN(toAt.getTime())) {
        qb.andWhere('checkout.occurredAt <= :toAt', { toAt });
      }
    }
    if (query.registerSessionId) {
      qb.andWhere('checkout.registerSessionId = :registerSessionId', {
        registerSessionId: query.registerSessionId,
      });
    }

    const checkouts = await qb.getMany();

    type RateBucket = {
      rate: number;
      taxableBase: number;
      taxAmount: number;
      lineCount: number;
    };
    type ShiftBucket = {
      registerSessionId: number | null;
      registerId: string | null;
      taxableBase: number;
      zeroRatedBase: number;
      taxAmount: number;
    };

    const rateMap = new Map<number, RateBucket>();
    const shiftMap = new Map<string, ShiftBucket>();
    let currency = 'ETB';
    let taxableBase = 0;
    let zeroRatedBase = 0;
    let taxAmount = 0;
    let settledCount = 0;
    let returnCount = 0;

    for (const checkout of checkouts) {
      currency = checkout.currency || currency;
      const sign =
        checkout.transactionType === PosCheckoutTransactionType.RETURN ? -1 : 1;

      if (checkout.transactionType === PosCheckoutTransactionType.RETURN) {
        returnCount += 1;
      } else {
        settledCount += 1;
      }

      const shiftKey =
        checkout.registerSessionId !== null &&
        checkout.registerSessionId !== undefined
          ? `session-${checkout.registerSessionId}`
          : checkout.registerId
            ? `register-${checkout.registerId}`
            : 'unassigned';

      if (!shiftMap.has(shiftKey)) {
        shiftMap.set(shiftKey, {
          registerSessionId: checkout.registerSessionId ?? null,
          registerId: checkout.registerId ?? null,
          taxableBase: 0,
          zeroRatedBase: 0,
          taxAmount: 0,
        });
      }
      const shift = shiftMap.get(shiftKey);

      const lines = Array.isArray(checkout.items) ? checkout.items : [];
      let lineLevelTax = false;

      for (const line of lines) {
        const lineTaxAmount = Number(line.taxAmount ?? 0) || 0;
        const lineTaxableBase =
          Number(
            line.taxableBase ?? Number(line.lineTotal ?? 0) - lineTaxAmount,
          ) || 0;
        const rawRate = line.taxRate;
        const rate = Number.isFinite(Number(rawRate))
          ? Number(rawRate)
          : lineTaxableBase > 0
            ? lineTaxAmount / lineTaxableBase
            : 0;
        const rateKey = Math.round(rate * 10000) / 10000;

        if (!rateMap.has(rateKey)) {
          rateMap.set(rateKey, {
            rate: rateKey,
            taxableBase: 0,
            taxAmount: 0,
            lineCount: 0,
          });
        }
        const bucket = rateMap.get(rateKey);
        bucket.taxableBase += sign * lineTaxableBase;
        bucket.taxAmount += sign * lineTaxAmount;
        bucket.lineCount += 1;

        taxAmount += sign * lineTaxAmount;
        if (rateKey === 0) {
          zeroRatedBase += sign * lineTaxableBase;
          shift.zeroRatedBase += sign * lineTaxableBase;
        } else {
          taxableBase += sign * lineTaxableBase;
          shift.taxableBase += sign * lineTaxableBase;
        }
        shift.taxAmount += sign * lineTaxAmount;
        lineLevelTax = true;
      }

      // Fall back to checkout-level totals when lines were not recorded
      // (e.g. legacy ingests).
      if (!lineLevelTax) {
        const checkoutTax = Number(checkout.taxAmount ?? 0) || 0;
        if (checkoutTax !== 0) {
          const checkoutTotal = Number(checkout.total ?? 0) || 0;
          const checkoutTaxable = Math.max(0, checkoutTotal - checkoutTax);
          const rate = checkoutTaxable > 0 ? checkoutTax / checkoutTaxable : 0;
          const rateKey = Math.round(rate * 10000) / 10000;
          if (!rateMap.has(rateKey)) {
            rateMap.set(rateKey, {
              rate: rateKey,
              taxableBase: 0,
              taxAmount: 0,
              lineCount: 0,
            });
          }
          const bucket = rateMap.get(rateKey);
          bucket.taxableBase += sign * checkoutTaxable;
          bucket.taxAmount += sign * checkoutTax;
          bucket.lineCount += 1;
          taxAmount += sign * checkoutTax;
          if (rateKey === 0) {
            zeroRatedBase += sign * checkoutTaxable;
            shift.zeroRatedBase += sign * checkoutTaxable;
          } else {
            taxableBase += sign * checkoutTaxable;
            shift.taxableBase += sign * checkoutTaxable;
          }
          shift.taxAmount += sign * checkoutTax;
        }
      }
    }

    const round2 = (value: number) => Math.round(value * 100) / 100;
    const breakdown: TaxSummaryRateBucketDto[] = Array.from(rateMap.values())
      .map((bucket) => {
        const label =
          bucket.rate === 0
            ? 'Zero-rated'
            : `${(bucket.rate * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
        return {
          rate: bucket.rate,
          label,
          taxableBase: round2(bucket.taxableBase),
          taxAmount: round2(bucket.taxAmount),
          lineCount: bucket.lineCount,
        };
      })
      .sort((left, right) => right.rate - left.rate);

    const shifts: TaxSummaryShiftDto[] = Array.from(shiftMap.values())
      .map((shift) => ({
        registerSessionId: shift.registerSessionId,
        registerId: shift.registerId,
        taxableBase: round2(shift.taxableBase),
        zeroRatedBase: round2(shift.zeroRatedBase),
        taxAmount: round2(shift.taxAmount),
        effectiveRate:
          shift.taxableBase > 0 ? shift.taxAmount / shift.taxableBase : 0,
      }))
      .sort((left, right) => right.taxAmount - left.taxAmount);

    return {
      branchId: query.branchId,
      currency,
      fromAt: query.fromAt ?? null,
      toAt: query.toAt ?? null,
      taxableBase: round2(taxableBase),
      zeroRatedBase: round2(zeroRatedBase),
      taxAmount: round2(taxAmount),
      effectiveRate: taxableBase > 0 ? taxAmount / taxableBase : 0,
      settledCount,
      returnCount,
      breakdown,
      shifts,
    };
  }

  private toListItem(checkout: PosCheckout) {
    const returnContext = this.extractReturnContext(checkout);
    return {
      id: checkout.id,
      branchId: checkout.branchId,
      partnerCredentialId: checkout.partnerCredentialId ?? null,
      externalCheckoutId: checkout.externalCheckoutId ?? null,
      idempotencyKey: checkout.idempotencyKey ?? null,
      registerId: checkout.registerId ?? null,
      registerSessionId: checkout.registerSessionId ?? null,
      suspendedCartId: checkout.suspendedCartId ?? null,
      receiptNumber: checkout.receiptNumber ?? null,
      transactionType: checkout.transactionType,
      status: checkout.status,
      currency: checkout.currency,
      subtotal: checkout.subtotal,
      discountAmount: checkout.discountAmount,
      taxAmount: checkout.taxAmount,
      total: checkout.total,
      paidAmount: checkout.paidAmount,
      changeDue: checkout.changeDue,
      tipAmount: checkout.tipAmount ?? 0,
      itemCount: checkout.itemCount,
      occurredAt: checkout.occurredAt,
      processedAt: checkout.processedAt ?? null,
      cashierUserId: checkout.cashierUserId ?? null,
      cashierName: checkout.cashierName ?? null,
      note: checkout.note ?? null,
      failureReason: checkout.failureReason ?? null,
      sourceReceiptId: returnContext?.sourceReceiptId ?? null,
      sourceReceiptNumber: returnContext?.sourceReceiptNumber ?? null,
      refundMethod: returnContext?.refundMethod ?? null,
      metadata: checkout.metadata ?? null,
      pricingSummary: this.extractPricingSummary(checkout),
      customerProfile: this.extractCustomerProfile(checkout),
      loyaltySummary: this.extractLoyaltySummary(checkout),
      createdAt: checkout.createdAt,
      updatedAt: checkout.updatedAt,
      tenders: (checkout.tenders ?? []).map((tender) => ({
        method: tender.method,
        amount: tender.amount,
        reference: tender.reference ?? null,
        note: tender.note ?? null,
        metadata: tender.metadata ?? null,
      })),
      items: (checkout.items ?? []).map((item) => ({
        productId: item.productId ?? null,
        aliasType: item.aliasType ?? null,
        aliasValue: item.aliasValue ?? null,
        sku: item.sku ?? null,
        title: item.title ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount ?? 0,
        taxRate: item.taxRate ?? null,
        taxableBase: item.taxableBase ?? null,
        taxAmount: item.taxAmount ?? 0,
        lineTotal: item.lineTotal,
        note: item.note ?? null,
        reasonCode: item.reasonCode ?? null,
        metadata: item.metadata ?? null,
      })),
    };
  }

  async getStylistSummary(
    query: StylistSummaryQueryDto,
  ): Promise<StylistSummaryResponseDto> {
    const qb = this.posCheckoutsRepository
      .createQueryBuilder('checkout')
      .where('checkout.branchId = :branchId', { branchId: query.branchId })
      .andWhere('checkout.status = :status', {
        status: PosCheckoutStatus.PROCESSED,
      });

    if (query.fromAt) {
      const fromAt = new Date(query.fromAt);
      if (!Number.isNaN(fromAt.getTime())) {
        qb.andWhere('checkout.occurredAt >= :fromAt', { fromAt });
      }
    }
    if (query.toAt) {
      const toAt = new Date(query.toAt);
      if (!Number.isNaN(toAt.getTime())) {
        qb.andWhere('checkout.occurredAt <= :toAt', { toAt });
      }
    }

    const checkouts = await qb.getMany();

    type StylistBucket = {
      stylistName: string;
      receiptsCount: number;
      servicesCount: number;
      revenue: number;
    };

    const stylistMap = new Map<string, StylistBucket>();
    let currency = 'ETB';
    let totalTips = 0;
    let tippedReceiptsCount = 0;

    for (const checkout of checkouts) {
      if (checkout.transactionType !== PosCheckoutTransactionType.SALE) {
        continue;
      }
      currency = checkout.currency || currency;

      const tip = Number(checkout.tipAmount ?? 0);
      totalTips += tip;
      if (tip > 0) tippedReceiptsCount += 1;

      const receiptStylists = new Set<string>();
      for (const item of checkout.items ?? []) {
        const name = String(item.metadata?.stylistName ?? '').trim();
        if (!name) continue;

        receiptStylists.add(name);
        const bucket = stylistMap.get(name) ?? {
          stylistName: name,
          receiptsCount: 0,
          servicesCount: 0,
          revenue: 0,
        };
        bucket.servicesCount += Number(item.quantity ?? 1);
        bucket.revenue += Number(
          item.lineTotal ??
            Number(item.unitPrice ?? 0) * Number(item.quantity ?? 1),
        );
        stylistMap.set(name, bucket);
      }

      for (const name of receiptStylists) {
        if (stylistMap.has(name)) {
          stylistMap.get(name).receiptsCount += 1;
        }
      }
    }

    const stylists = [...stylistMap.values()].sort(
      (a, b) => b.revenue - a.revenue,
    );

    return {
      branchId: query.branchId,
      currency,
      fromAt: query.fromAt ?? null,
      toAt: query.toAt ?? null,
      totalTips,
      tippedReceiptsCount,
      stylists,
    };
  }

  async voidCheckout(
    checkoutId: number,
    dto: VoidPosCheckoutDto,
    actorId: number,
    actorBranchId?: number,
  ): Promise<{
    id: number;
    status: string;
    voidedAt: string;
    voidedByUserId: number;
  }> {
    const checkout = await this.posCheckoutsRepository.findOne({
      where: { id: checkoutId },
    });

    if (!checkout) {
      throw new NotFoundException(`Checkout #${checkoutId} not found`);
    }

    // Branch-scope guard: non-global callers must match the checkout's branch.
    if (
      actorBranchId !== undefined &&
      actorBranchId !== null &&
      checkout.branchId !== actorBranchId
    ) {
      throw new ForbiddenException(
        'You do not have permission to void checkouts on this branch',
      );
    }

    if (checkout.status === PosCheckoutStatus.VOIDED) {
      throw new BadRequestException('Checkout is already voided');
    }

    const voidableStatuses: string[] = [
      PosCheckoutStatus.PROCESSED,
      PosCheckoutStatus.RECEIVED,
      // FAILED checkouts (ingest errors) are also voidable: they are orphaned
      // records that never committed inventory side-effects, so voiding them
      // is safe and provides a clean audit trail for data-correction purposes.
      PosCheckoutStatus.FAILED,
    ];
    if (!voidableStatuses.includes(checkout.status)) {
      throw new BadRequestException(
        `Only settled checkouts can be voided (current status: ${checkout.status})`,
      );
    }

    const voidedAt = new Date();
    const voidedByUserId = dto.authorisedByUserId ?? actorId;

    await this.posCheckoutsRepository.update(checkoutId, {
      status: PosCheckoutStatus.VOIDED,
      voidedAt,
      voidedByUserId,
      voidReason: dto.reason ?? null,
    });

    // Best-effort: reverse the checkout's ledger entry so a void backs revenue,
    // tax and receivable out of the books. No-op if the sale was never posted
    // (e.g. accrual formats, or pre-ledger checkouts).
    try {
      const ledgerKey = this.ledgerKeyForCheckout(checkout);
      const entry = await this.generalLedger.findEntryByIdempotencyKey(
        checkout.branchId,
        ledgerKey,
      );
      if (entry) {
        await this.generalLedger.reverse(entry.id, {
          sourceType: GlJournalSourceType.POS_VOID_REVERSAL,
          idempotencyKey: `void-${ledgerKey}`,
          occurredAt: voidedAt,
          memo: `Void of checkout ${checkout.receiptNumber ?? checkout.id}`,
          createdByUserId: voidedByUserId,
        });
      }
    } catch (error) {
      this.logger.warn(
        `GL reversal failed for void of checkout ${checkoutId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    return {
      id: checkoutId,
      status: 'VOIDED',
      voidedAt: voidedAt.toISOString(),
      voidedByUserId,
    };
  }

  private toResponse(checkout: PosCheckout): PosCheckoutResponseDto {
    return {
      ...this.toListItem(checkout),
      metadata: checkout.metadata ?? null,
    };
  }
}
