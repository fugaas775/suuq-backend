import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { Branch } from '../branches/entities/branch.entity';
import { StockMovementType } from '../branches/entities/stock-movement.entity';
import { PartnerCredential } from '../partner-credentials/entities/partner-credential.entity';
import { ProductAliasesService } from '../product-aliases/product-aliases.service';
import { Product } from '../products/entities/product.entity';
import {
  IngestPosCheckoutDto,
  PosCheckoutItemDto,
} from './dto/ingest-pos-checkout.dto';
import { PosCheckoutQuoteResponseDto } from './dto/pos-checkout-quote-response.dto';
import { ListPosCheckoutsQueryDto } from './dto/list-pos-checkouts-query.dto';
import {
  PosCheckoutPageResponseDto,
  PosCheckoutResponseDto,
} from './dto/pos-checkout-response.dto';
import {
  QuotePosCheckoutDto,
  QuotePosCheckoutItemDto,
} from './dto/quote-pos-checkout.dto';
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
    private readonly productAliasesService: ProductAliasesService,
  ) {}

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
        itemCount: dto.items.length,
        occurredAt: new Date(dto.occurredAt),
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

          await this.inventoryLedgerService.recordMovement(
            {
              branchId: dto.branchId,
              productId,
              movementType:
                dto.transactionType === PosCheckoutTransactionType.SALE
                  ? StockMovementType.SALE
                  : StockMovementType.ADJUSTMENT,
              quantityDelta:
                dto.transactionType === PosCheckoutTransactionType.SALE
                  ? -quantity
                  : quantity,
              sourceType: 'POS_CHECKOUT',
              sourceReferenceId: checkout.id,
              actorUserId: actor.id ?? null,
              note: this.buildMovementNote(dto, item),
              occurredAt: new Date(dto.occurredAt),
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

    return this.toResponse(await this.findOneById(checkout.id));
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

    return (
      category === 'FOOD_SERVICE' ||
      serviceFormat === 'CAFETERIA' ||
      serviceFormat === 'QSR' ||
      serviceFormat === 'FSR'
    );
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

    return Object.keys(baseMetadata).length ? baseMetadata : null;
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
      pricingSummary: this.extractPricingSummary(checkout),
      customerProfile: this.extractCustomerProfile(checkout),
      loyaltySummary: this.extractLoyaltySummary(checkout),
      createdAt: checkout.createdAt,
      updatedAt: checkout.updatedAt,
    };
  }

  private toResponse(checkout: PosCheckout): PosCheckoutResponseDto {
    return {
      ...this.toListItem(checkout),
      metadata: checkout.metadata ?? null,
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
        taxAmount: item.taxAmount ?? 0,
        lineTotal: item.lineTotal,
        note: item.note ?? null,
        reasonCode: item.reasonCode ?? null,
        metadata: item.metadata ?? null,
      })),
    };
  }
}
