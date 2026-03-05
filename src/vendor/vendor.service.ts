import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { CreateVendorProductDto } from './dto/create-vendor-product.dto';
import { FindAllVendorsDto } from './dto/find-all-vendors.dto';
import { UpdateVendorProductDto } from './dto/update-vendor-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Raw, ILike, In, IsNull, Brackets } from 'typeorm';
import {
  CertificationStatus,
  User,
  VerificationStatus,
  SubscriptionTier,
  isCertifiedVendor,
  resolveCertificationStatus,
} from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { ProductImpression } from '../products/entities/product-impression.entity';
import { Category } from '../categories/entities/category.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { Order, OrderItem } from '../orders/entities/order.entity';
import { Dispute } from '../orders/entities/dispute.entity';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  DeliveryAcceptanceStatus,
} from '../orders/entities/order.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { buildOrderStatusNotification } from '../orders/order-notifications.util';
import { normalizeProductMedia } from '../common/utils/media-url.util';
import { UserRole } from '../auth/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Tag } from '../tags/tag.entity';
import { DoSpacesService } from '../media/do-spaces.service';
import {
  normalizeDigitalAttributes,
  validateDigitalStructure,
  mapDigitalError,
} from '../common/utils/digital.util';
import { Logger } from '@nestjs/common';
import { CurrencyService } from '../common/services/currency.service';
import { ShippingService } from '../shipping/shipping.service';
import { GenerateLabelDto } from './dto/generate-label.dto';
import { UserReport } from '../moderation/entities/user-report.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class VendorService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(ProductImage)
    private readonly productImageRepository: Repository<ProductImage>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    @InjectRepository(UserReport)
    private readonly userReportRepository: Repository<UserReport>,
    @InjectRepository(ProductImpression)
    private readonly impressionRepo: Repository<ProductImpression>,
    private readonly notificationsService: NotificationsService,
    private readonly doSpacesService: DoSpacesService,
    private readonly currencyService: CurrencyService,
    private readonly shippingService: ShippingService,
    private readonly settingsService: SettingsService,
    private readonly emailService: EmailService,
  ) {}

  private readonly logger = new Logger(VendorService.name);
  private readonly supportedCurrencies = ['ETB', 'SOS', 'KES', 'DJF', 'USD'];
  private readonly allowedDigitalExt = new Set(['pdf', 'epub', 'zip']);
  private privateNoteColumnsAvailable: boolean | null = null;

  private normalizeCurrency(value?: string | null): string {
    const upper = (value || '').trim().toUpperCase();
    return this.supportedCurrencies.includes(upper) ? upper : 'ETB';
  }

  private isMissingPrivateNoteColumnError(err: unknown): boolean {
    const msg = String((err as any)?.message || '').toLowerCase();
    return msg.includes('private_note') && msg.includes('does not exist');
  }

  private async hasPrivateNoteColumns(): Promise<boolean> {
    if (this.privateNoteColumnsAvailable !== null) {
      return this.privateNoteColumnsAvailable;
    }
    try {
      const rows = await this.productRepository.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product' AND column_name = 'private_note' LIMIT 1`,
      );
      this.privateNoteColumnsAvailable = Array.isArray(rows) && rows.length > 0;
      if (!this.privateNoteColumnsAvailable) {
        this.logger.warn(
          'product.private_note column is missing; internal-note features are temporarily disabled until migrations run.',
        );
      }
      return this.privateNoteColumnsAvailable;
    } catch (err) {
      this.privateNoteColumnsAvailable = false;
      this.logger.warn(
        'Failed to verify private note schema; internal-note features are temporarily disabled.',
      );
      return false;
    }
  }

  private normalizePrivateNoteInput(value: unknown): string | null | undefined {
    if (typeof value === 'undefined') return undefined;
    if (value === null) return null;
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
  }

  private actorDisplayName(
    actor: Partial<User> | undefined,
    fallback: User,
  ): string {
    if (actor) {
      const actorName =
        actor.displayName ||
        (actor as any).contactName ||
        (actor.email ? String(actor.email).split('@')[0] : undefined);
      if (actorName) return actorName;
    }
    return (
      fallback.displayName ||
      (fallback as any).contactName ||
      (fallback.email ? String(fallback.email).split('@')[0] : 'Vendor')
    );
  }

  private isVehicleCategory(category?: Category | null): boolean {
    if (!category) return false;
    const slug = String((category as any)?.slug || '').toLowerCase();
    const name = String((category as any)?.name || '').toLowerCase();
    return /(car|truck|motorcycle|auto|boat|vehicle)/i.test(slug + ' ' + name);
  }

  private sanitizeVehicleAttributesForCategory(
    attrs: Record<string, any> | undefined,
    category?: Category | null,
  ): Record<string, any> | undefined {
    if (!attrs || typeof attrs !== 'object') return attrs;
    if (this.isVehicleCategory(category)) return attrs;

    const out = { ...attrs };
    for (const key of [
      'make',
      'model',
      'year',
      'mileage',
      'transmission',
      'fuelType',
      'fuel_type',
      'vehicleType',
      'vehicle_type',
      'engineCapacity',
      'engine_capacity',
    ]) {
      if (Object.prototype.hasOwnProperty.call(out, key)) delete out[key];
    }
    return out;
  }

  private extractExtFromRef(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw) return null;

    let fileLike = raw;
    try {
      if (raw.startsWith('http://') || raw.startsWith('https://')) {
        const parsed = new URL(raw);
        fileLike = parsed.pathname || raw;
      }
    } catch {
      fileLike = raw;
    }

    const noQuery = fileLike.split('?')[0].split('#')[0];
    const name = noQuery.split('/').pop() || noQuery;
    const ext = name.split('.').pop()?.toLowerCase();
    return ext || null;
  }

  private isSupportedDigitalRef(value: unknown): boolean {
    const ext = this.extractExtFromRef(value);
    return !!ext && this.allowedDigitalExt.has(ext);
  }

  private hasValidDigitalHints(
    attrs: Record<string, any> | undefined,
  ): boolean {
    if (!attrs || typeof attrs !== 'object') return false;
    const digKey = (attrs as any)?.digital?.download?.key;
    return (
      this.isSupportedDigitalRef((attrs as any)?.downloadKey) ||
      this.isSupportedDigitalRef((attrs as any)?.download_key) ||
      this.isSupportedDigitalRef((attrs as any)?.downloadUrl) ||
      this.isSupportedDigitalRef((attrs as any)?.download_url) ||
      this.isSupportedDigitalRef(digKey)
    );
  }

  private stripInvalidDigitalHintsForNonDigital(
    attrs: Record<string, any> | undefined,
  ): Record<string, any> | undefined {
    if (!attrs || typeof attrs !== 'object') return attrs;
    if (this.hasValidDigitalHints(attrs)) return attrs;

    const out = { ...attrs };
    for (const key of [
      'digital',
      'downloadKey',
      'download_key',
      'downloadUrl',
      'download_url',
      'isFree',
      'is_free',
      'licenseRequired',
      'license_required',
    ]) {
      if (Object.prototype.hasOwnProperty.call(out, key)) {
        delete out[key];
      }
    }
    return out;
  }

  private resolveListedBy(product: any): {
    name: string;
    type: 'owner' | 'staff' | 'store' | 'guest';
    id?: number | null;
  } {
    if (product?.originalCreatorContact?.name) {
      return {
        name: String(product.originalCreatorContact.name),
        type: 'guest',
        id: null,
      };
    }

    if (product?.createdByName) {
      return {
        name: String(product.createdByName),
        type: 'staff',
        id:
          typeof product?.createdById === 'number'
            ? product.createdById
            : product?.createdById != null
              ? Number(product.createdById)
              : null,
      };
    }

    const vendor = product?.vendor;
    return {
      name: String(vendor?.storeName || vendor?.displayName || 'Suuq Vendor'),
      type: 'store',
      id:
        typeof vendor?.id === 'number'
          ? vendor.id
          : vendor?.id != null
            ? Number(vendor.id)
            : null,
    };
  }

  private attachListedBy<T extends Record<string, any>>(items: T[]): T[] {
    return (items || []).map((item) => ({
      ...item,
      listedBy: this.resolveListedBy(item),
    }));
  }

  private async getInternalNoteMap(
    userId: number,
    productIds: number[],
  ): Promise<
    Map<
      number,
      {
        hasInternalNote: boolean;
        privateNoteUpdatedAt: Date | null;
        privateNoteUpdatedById: number | null;
        privateNoteUpdatedByName: string | null;
      }
    >
  > {
    const ids = Array.from(
      new Set(
        (productIds || []).map((id) => Number(id)).filter((id) => id > 0),
      ),
    );
    const out = new Map<
      number,
      {
        hasInternalNote: boolean;
        privateNoteUpdatedAt: Date | null;
        privateNoteUpdatedById: number | null;
        privateNoteUpdatedByName: string | null;
      }
    >();
    if (!ids.length) return out;

    const hasColumns = await this.hasPrivateNoteColumns();
    if (!hasColumns) return out;

    let rows: Array<{
      id: string;
      has_internal_note: boolean | string;
      private_note_updated_at: Date | string | null;
      private_note_updated_by_id: string | null;
      private_note_updated_by_name: string | null;
    }> = [];

    try {
      rows = await this.productRepository
        .createQueryBuilder('product')
        .select('product.id', 'id')
        .addSelect(
          `CASE WHEN NULLIF(BTRIM(product.private_note), '') IS NULL THEN false ELSE true END`,
          'has_internal_note',
        )
        .addSelect('product.private_note_updated_at', 'private_note_updated_at')
        .addSelect(
          'product.private_note_updated_by_id',
          'private_note_updated_by_id',
        )
        .addSelect(
          'product.private_note_updated_by_name',
          'private_note_updated_by_name',
        )
        .where('product.vendorId = :userId', { userId })
        .andWhere('product.id IN (:...ids)', { ids })
        .andWhere('product.deletedAt IS NULL')
        .getRawMany<{
          id: string;
          has_internal_note: boolean | string;
          private_note_updated_at: Date | string | null;
          private_note_updated_by_id: string | null;
          private_note_updated_by_name: string | null;
        }>();
    } catch (err) {
      if (this.isMissingPrivateNoteColumnError(err)) {
        this.privateNoteColumnsAvailable = false;
        this.logger.warn(
          'product.private_note columns missing; returning vendor products without internal-note metadata.',
        );
        return out;
      }
      throw err;
    }

    for (const row of rows) {
      const id = Number(row.id);
      if (!id) continue;
      const hasInternalNote =
        row.has_internal_note === true || row.has_internal_note === 'true';
      out.set(id, {
        hasInternalNote,
        privateNoteUpdatedAt: row.private_note_updated_at
          ? new Date(row.private_note_updated_at)
          : null,
        privateNoteUpdatedById: row.private_note_updated_by_id
          ? Number(row.private_note_updated_by_id)
          : null,
        privateNoteUpdatedByName: row.private_note_updated_by_name || null,
      });
    }

    return out;
  }

  private convertPrice(
    amount: number | null | undefined,
    from: string,
    to: string,
  ): { amount: number | null; rate?: number } {
    if (amount === null || amount === undefined) return { amount: null };
    try {
      const converted = this.currencyService.convert(amount, from, to);
      const rate = this.currencyService.getRate(from, to);
      return {
        amount: converted,
        rate:
          typeof rate === 'number'
            ? Math.round(rate * 1_000_000) / 1_000_000
            : undefined,
      };
    } catch (err) {
      this.logger.warn(
        `Currency convert failed from ${from} to ${to}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { amount, rate: undefined };
    }
  }

  private async notifyOrderStatusChange(order: Order, status: OrderStatus) {
    let userId = order?.user?.id;
    if (!userId) {
      const withUser = await this.orderRepository.findOne({
        where: { id: order.id },
        relations: ['user'],
      });
      userId = withUser?.user?.id;
    }

    if (!userId) return;

    const payload = buildOrderStatusNotification(order.id, status);
    await this.notificationsService.createAndDispatch({
      userId,
      title: payload.title,
      body: payload.body,
      type: NotificationType.ORDER,
      data: payload.data,
    });
  }

  private applyCurrencyToProduct(product: Product, target: string): Product {
    if (!product) return product;
    const from = (product as any)?.currency || 'ETB';
    const { amount: priceConverted, rate } = this.convertPrice(
      product.price,
      from,
      target,
    );
    const { amount: saleConverted } = this.convertPrice(
      (product as any)?.sale_price,
      from,
      target,
    );

    (product as any).price = priceConverted ?? product.price;
    (product as any).currency = target;

    // PROPERTY FORMATTING LOGIC
    let suffix = '';
    if (product.listingType === 'rent' && product.rentPeriod) {
      suffix = ` / ${product.rentPeriod}`;
    } else if (
      product.listingType === 'sale' &&
      product.productType === 'property' &&
      product.sizeSqm
    ) {
      // For sales, we might want to display unit price or just show total.
      // Frontend said: "For sales/others: / m² (calculating unit price display)."
      // We will provide the suffix here, but the amount is still TOTAL.
      // The frontend likely calculates unit price separately.
      // We'll leave suffix empty for sale to avoid confusion with Total Price,
      // or we can add a specific unit_suffix field.
      // For now, let's stick to the requested " / month" style for rent which affects the main price.
    }

    (product as any).price_display = {
      amount: priceConverted ?? product.price ?? null,
      currency: target,
      convertedFrom: from,
      rate,
      suffix, // e.g. " / month"
    };

    if (saleConverted !== null && saleConverted !== undefined) {
      (product as any).sale_price = saleConverted;
      (product as any).sale_price_display = {
        amount: saleConverted,
        currency: target,
        convertedFrom: from,
        rate,
      };
    }

    return product;
  }

  private applyCurrencyToProducts(items: Product[], target: string): Product[] {
    if (!Array.isArray(items) || !items.length) return items || [];
    return items.map((p) => this.applyCurrencyToProduct(p, target));
  }

  // ✅ FIX: This function now correctly handles an array of ImageDto objects
  async createMyProduct(
    userId: number,
    dto: CreateVendorProductDto,
    creator?: Partial<User>,
  ): Promise<Product> {
    const vendor = await this.userRepository.findOneBy({ id: userId });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${userId} not found.`);
    }

    let createdById: number | undefined;
    let createdByName: string | undefined;

    if (creator && creator.id && creator.id !== vendor.id) {
      createdById = creator.id;
      createdByName =
        creator.displayName ||
        (creator as any).contactName ||
        (creator.email ? creator.email.split('@')[0] : 'Staff');
    }

    // --- Product Posting Limits ---
    // Guests: Handled by AuthGuard (cannot reach here).
    // Customers: 1 Product.
    // Free Vendor (Verified or Unverified): 5 Products.
    // Pro Vendor: Unlimited.

    const productCount = await this.productRepository.count({
      where: { vendor: { id: userId } },
    });

    // Certification gate: Certified (verified) vendors get unlimited slots; others are limited.
    const isCertified = isCertifiedVendor(vendor);
    const isVendor = vendor.roles.includes(UserRole.VENDOR);

    if (!isCertified) {
      if (isVendor) {
        const freeLimitRaw = await this.settingsService.getSystemSetting(
          'limit.free_vendor_products',
        );
        const freeLimit = freeLimitRaw ? Number(freeLimitRaw) : 5;

        // limit 5 (default)
        if (productCount >= freeLimit) {
          throw new ForbiddenException(
            `Uncertified vendors are limited to ${freeLimit} products. Submit and verify your business license to become Certified for unlimited listings.`,
          );
        }
      } else {
        const customerLimitRaw = await this.settingsService.getSystemSetting(
          'limit.customer_products',
        );
        const customerLimit = customerLimitRaw ? Number(customerLimitRaw) : 1;

        // limit 1 (default)
        // Note: Customers can post 1 product to "try it out" or simply exist
        if (productCount >= customerLimit) {
          throw new ForbiddenException(
            `Customers are limited to ${customerLimit} product. Become a Vendor to list more.`,
          );
        }
      }
    }

    const {
      images,
      categoryId,
      listingType,
      listingTypeMulti,
      listingCity,
      bedrooms,
      bathrooms,
      sizeSqm,
      furnished,
      rentPeriod,
      totalPrice,
      attributes,
      tags,
      featured,
      featuredExpiresAt,
      featuredPaidAmount, // Destructure
      featuredPaidCurrency, // Destructure
      privateNote,
      ...productData
    } = dto as any;

    const normalizedProductData: Record<string, any> = {
      ...productData,
    };
    const incomingType =
      typeof (dto as any)?.productType === 'string'
        ? (dto as any).productType
        : typeof (dto as any)?.type === 'string'
          ? (dto as any).type
          : undefined;
    if (incomingType) {
      normalizedProductData.productType = String(incomingType).toLowerCase();
    }
    const incomingStockQuantity =
      (dto as any)?.stockQuantity ?? (dto as any)?.stock_quantity;
    if (incomingStockQuantity !== undefined && incomingStockQuantity !== null) {
      normalizedProductData.stockQuantity = Number(incomingStockQuantity);
    }
    if ('stock_quantity' in normalizedProductData)
      delete normalizedProductData.stock_quantity;
    if ('type' in normalizedProductData) delete normalizedProductData.type;

    const categoryRepo = this.productRepository.manager.getRepository(Category);
    const effectiveCategory = categoryId
      ? await categoryRepo.findOne({ where: { id: Number(categoryId) } })
      : null;
    if (categoryId && !effectiveCategory) {
      throw new NotFoundException(`Category with ID ${categoryId} not found.`);
    }

    const normalizedPrivateNote = this.normalizePrivateNoteInput(privateNote);
    const noteActorId = Number(creator?.id || vendor.id);
    const noteActorName = this.actorDisplayName(creator, vendor);

    // Normalize listingType if client sent listingTypeMulti
    const resolvedListingType: 'sale' | 'rent' | undefined = (() => {
      if (listingType && (listingType === 'sale' || listingType === 'rent'))
        return listingType;
      if (Array.isArray(listingTypeMulti) && listingTypeMulti.length) {
        const first = String(listingTypeMulti[0] || '').toLowerCase();
        if (first === 'sale' || first === 'sell') return 'sale';
        if (first === 'rent' || first === 'rental') return 'rent';
      }
      return undefined;
    })();

    let safeAttributes: Record<string, any> | undefined = (() => {
      const a: Record<string, any> = {};
      if (attributes && typeof attributes === 'object')
        Object.assign(a, attributes);

      if (totalPrice !== undefined) {
        a.totalPrice = totalPrice;
      }

      // Some clients send videoUrl at top-level attributes or in dto.attributes
      if (a.videoUrl == null && dto && (dto as any).attributes?.videoUrl) {
        a.videoUrl = (dto as any).attributes.videoUrl;
      }
      // Also accept top-level dto.videoUrl
      if (a.videoUrl == null && (dto as any)?.videoUrl)
        a.videoUrl = (dto as any).videoUrl;
      // Poster URL handling
      if (a.posterUrl == null && dto && (dto as any).attributes?.posterUrl) {
        a.posterUrl = (dto as any).attributes.posterUrl;
      }
      if (a.posterUrl == null && (dto as any)?.posterUrl)
        a.posterUrl = (dto as any).posterUrl;
      // Digital product download URL (server will derive key)
      if (
        a.downloadUrl == null &&
        dto &&
        (dto as any).attributes?.downloadUrl
      ) {
        a.downloadUrl = (dto as any).attributes.downloadUrl;
      }
      if (a.downloadUrl == null && (dto as any)?.downloadUrl)
        a.downloadUrl = (dto as any).downloadUrl;
      // Digital product download key
      if (
        a.downloadKey == null &&
        dto &&
        (dto as any).attributes?.downloadKey
      ) {
        a.downloadKey = (dto as any).attributes.downloadKey;
      }
      if (a.downloadKey == null && (dto as any)?.downloadKey)
        a.downloadKey = (dto as any).downloadKey;
      // Free flag (boolean)
      if (typeof (dto as any)?.isFree === 'boolean')
        a.isFree = !!(dto as any).isFree;
      if (
        dto &&
        (dto as any).attributes &&
        typeof (dto as any).attributes.isFree === 'boolean' &&
        a.isFree == null
      ) {
        a.isFree = !!(dto as any).attributes.isFree;
      }
      // Also accept top-level dto.attributes.videoUrl or dto.videoUrl inside dto.attributes
      return Object.keys(a).length ? a : undefined;
    })();

    // Normalize & validate digital schema (create path)
    if (safeAttributes) {
      safeAttributes = this.sanitizeVehicleAttributesForCategory(
        safeAttributes,
        effectiveCategory,
      );

      if (productData.productType !== 'digital') {
        safeAttributes =
          this.stripInvalidDigitalHintsForNonDigital(safeAttributes);
      }

      try {
        const hasExplicitDigitalHints =
          this.hasValidDigitalHints(safeAttributes);
        const shouldProcessDigital =
          productData.productType === 'digital' || hasExplicitDigitalHints;
        if (!shouldProcessDigital) {
          this.logger.debug(
            'Normalize digital attributes (create) skipped for non-digital product with no valid digital hints',
          );
          throw new Error('DIGITAL_INFERENCE_SKIP_SENTINEL');
        }
        const before = JSON.stringify(safeAttributes);
        const norm = normalizeDigitalAttributes(safeAttributes);
        safeAttributes = norm.updated;
        if (norm.inferredType === 'digital')
          productData.productType = 'digital';
        const after = JSON.stringify(safeAttributes);
        if (before !== after) {
          this.logger.debug(
            `Normalized digital attributes (create) product temp: ${before} -> ${after}`,
          );
        }
        // Validate if explicitly digital or inferred digital
        if (productData.productType === 'digital') {
          try {
            validateDigitalStructure(safeAttributes, {
              requireKey: true,
              maxSizeBytes: 100 * 1024 * 1024,
            });
          } catch (e: any) {
            const { code, message } = mapDigitalError(String(e?.message || ''));
            throw new ForbiddenException({ error: message, code });
          }
        }
      } catch (err) {
        if (err?.message !== 'DIGITAL_INFERENCE_SKIP_SENTINEL') {
          this.logger.debug(
            `Normalize digital attributes (create) skipped due to error: ${String(err?.message || err)}`,
          );
        }
      }
    }

    const newProduct = this.productRepository.create({
      ...normalizedProductData,
      status: 'publish',
      vendor: vendor,
      createdById,
      createdByName,
      category: effectiveCategory ?? undefined,
      imageUrl: images && images.length > 0 ? images[0].src : null, // Set main display image
      listingType: resolvedListingType,
      listingCity,
      bedrooms,
      bathrooms,
      sizeSqm,
      furnished,
      rentPeriod,
      attributes: safeAttributes,
      productType:
        productData.productType ||
        (resolvedListingType ? 'property' : undefined),
      ...(normalizedPrivateNote !== undefined
        ? {
            privateNote: normalizedPrivateNote,
            privateNoteUpdatedAt: new Date(),
            privateNoteUpdatedById: noteActorId,
            privateNoteUpdatedByName: noteActorName,
          }
        : {}),
    } as Product); // Assert as Product

    // Handle initial featured state if provided during creation
    if (featured) {
      newProduct.featured = true;
      if (featuredExpiresAt) {
        newProduct.featuredExpiresAt = new Date(featuredExpiresAt);
      } else {
        const d = new Date();
        d.setDate(d.getDate() + 3); // Default 3 days if not specified
        newProduct.featuredExpiresAt = d;
      }
      if (typeof featuredPaidAmount === 'number')
        newProduct.featuredPaidAmount = featuredPaidAmount;
      if (typeof featuredPaidCurrency === 'string')
        newProduct.featuredPaidCurrency = featuredPaidCurrency;
    }

    // 1. Save the main product to get its ID
    const savedProduct = (await this.productRepository.save(
      newProduct as any,
    )) as Product;

    // 2. Handle tags by names (create if missing)
    if (Array.isArray(tags)) {
      const tagNames: string[] = tags
        .map((t: any) => (typeof t === 'string' ? t.trim() : ''))
        .filter((s: string) => !!s);
      if (tagNames.length) {
        const existing = await this.tagRepository.find({
          where: { name: In(tagNames) } as any,
        });
        const existingNames = new Set(existing.map((t: any) => t.name));
        const toCreate = tagNames.filter((n) => !existingNames.has(n));
        const created = toCreate.length
          ? await this.tagRepository.save(
              toCreate.map((name) => this.tagRepository.create({ name })),
            )
          : [];
        (savedProduct as any).tags = [...existing, ...created];
        await this.productRepository.save(savedProduct);
      }
    }

    // 3. Create and save all associated image entities
    if (images && images.length > 0) {
      const imageEntities = images.map((imageObj, index) =>
        this.productImageRepository.create({
          src: imageObj.src,
          thumbnailSrc: imageObj.thumbnailSrc,
          lowResSrc: imageObj.lowResSrc,
          product: savedProduct, // Link to the product
          sortOrder: index,
        }),
      );
      await this.productImageRepository.save(imageEntities);
    }

    // 4. Return the full product with all its new relations
    return this.productRepository.findOneOrFail({
      where: { id: savedProduct.id },
      relations: ['images', 'vendor', 'category', 'tags'],
    });
  }

  // ✅ FIX: This function is now type-safe and handles image updates
  async updateMyProduct(
    userId: number,
    productId: number,
    dto: UpdateVendorProductDto,
    updater?: Partial<User>,
  ): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId, vendor: { id: userId } },
      relations: ['category'],
    });
    if (!product) {
      throw new NotFoundException('Product not found or you do not own it.');
    }

    const {
      images,
      categoryId,
      listingType,
      listingTypeMulti,
      listingCity,
      bedrooms,
      bathrooms,
      sizeSqm,
      furnished,
      rentPeriod,
      totalPrice,
      attributes,
      tags,
      featured,
      featuredExpiresAt,
      featuredPaidAmount, // Destructure
      featuredPaidCurrency, // Destructure
      privateNote,
      ...productData
    } = dto as any;

    const normalizedProductData: Record<string, any> = {
      ...productData,
    };
    const incomingType =
      typeof (dto as any)?.productType === 'string'
        ? (dto as any).productType
        : typeof (dto as any)?.type === 'string'
          ? (dto as any).type
          : undefined;
    if (incomingType) {
      normalizedProductData.productType = String(incomingType).toLowerCase();
    }
    const incomingStockQuantity =
      (dto as any)?.stockQuantity ?? (dto as any)?.stock_quantity;
    if (incomingStockQuantity !== undefined && incomingStockQuantity !== null) {
      normalizedProductData.stockQuantity = Number(incomingStockQuantity);
    }
    if ('stock_quantity' in normalizedProductData)
      delete normalizedProductData.stock_quantity;
    if ('type' in normalizedProductData) delete normalizedProductData.type;

    const categoryRepo = this.productRepository.manager.getRepository(Category);
    let effectiveCategory: Category | null = (product as any).category || null;
    if (typeof categoryId !== 'undefined') {
      if (categoryId) {
        const category = await categoryRepo.findOne({
          where: { id: Number(categoryId) },
        });
        if (!category) {
          throw new NotFoundException(
            `Category with ID ${categoryId} not found.`,
          );
        }
        effectiveCategory = category;
      } else {
        effectiveCategory = null;
      }
    }

    // Update simple fields (exclude computed getters like posterUrl/videoUrl)
    if (normalizedProductData && typeof normalizedProductData === 'object') {
      // Extra safety: drop any computed keys if present
      if ('posterUrl' in normalizedProductData)
        delete normalizedProductData.posterUrl;
      if ('videoUrl' in normalizedProductData)
        delete normalizedProductData.videoUrl;
      if ('status' in normalizedProductData)
        delete normalizedProductData.status;
      if ('isFree' in normalizedProductData)
        delete normalizedProductData.isFree;
      if ('downloadKey' in normalizedProductData)
        delete normalizedProductData.downloadKey;
      if ('downloadUrl' in normalizedProductData)
        delete normalizedProductData.downloadUrl;
    }
    Object.assign(product, normalizedProductData);

    const normalizedPrivateNote = this.normalizePrivateNoteInput(privateNote);
    if (normalizedPrivateNote !== undefined) {
      const actorId = Number(updater?.id || userId);
      const actorName = this.actorDisplayName(updater, product.vendor);
      product.privateNote = normalizedPrivateNote;
      product.privateNoteUpdatedAt = new Date();
      product.privateNoteUpdatedById = actorId;
      product.privateNoteUpdatedByName = actorName;
    }

    // [Fix] Handle featured status and expiration
    if (typeof featured === 'boolean') {
      product.featured = featured;
      if (featured) {
        if (featuredExpiresAt) {
          product.featuredExpiresAt = new Date(featuredExpiresAt);
        } else if (!product.featuredExpiresAt) {
          // Fallback: Default to 3 days if not provided
          const date = new Date();
          date.setDate(date.getDate() + 3);
          product.featuredExpiresAt = date;
        }

        // Save Amount
        if (typeof featuredPaidAmount === 'number')
          product.featuredPaidAmount = featuredPaidAmount;
        if (typeof featuredPaidCurrency === 'string')
          product.featuredPaidCurrency = featuredPaidCurrency;
      } else {
        product.featuredExpiresAt = null;
        product.featuredPaidAmount = null;
        product.featuredPaidCurrency = null;
      }
    } else {
      // Case: Partial update (e.g. extending date or updating amount only)
      if (featuredExpiresAt) {
        product.featuredExpiresAt = new Date(featuredExpiresAt);
      }
      if (typeof featuredPaidAmount === 'number')
        product.featuredPaidAmount = featuredPaidAmount;
      if (typeof featuredPaidCurrency === 'string')
        product.featuredPaidCurrency = featuredPaidCurrency;
    }

    // Merge property fields
    const resolvedListingType: 'sale' | 'rent' | undefined = (() => {
      if (listingType && (listingType === 'sale' || listingType === 'rent'))
        return listingType;
      if (Array.isArray(listingTypeMulti) && listingTypeMulti.length) {
        const first = String(listingTypeMulti[0] || '').toLowerCase();
        if (first === 'sale' || first === 'sell') return 'sale';
        if (first === 'rent' || first === 'rental') return 'rent';
      }
      return undefined;
    })();
    if (resolvedListingType) product.listingType = resolvedListingType;
    if (typeof listingCity !== 'undefined')
      product.listingCity = listingCity ?? null;
    if (typeof bedrooms !== 'undefined') product.bedrooms = bedrooms;
    if (typeof bathrooms !== 'undefined') product.bathrooms = bathrooms;
    if (typeof sizeSqm !== 'undefined') product.sizeSqm = sizeSqm;
    if (typeof furnished !== 'undefined') product.furnished = furnished;
    if (typeof rentPeriod !== 'undefined') product.rentPeriod = rentPeriod;

    // Ensure we merge totalPrice into attributes if passed top-level
    const nextAttributes =
      typeof attributes !== 'undefined' && attributes !== null
        ? { ...attributes }
        : {};

    if (typeof totalPrice !== 'undefined') {
      nextAttributes.totalPrice = totalPrice;
    }

    if (
      Object.keys(nextAttributes).length > 0 ||
      typeof attributes !== 'undefined'
    ) {
      const existing =
        product.attributes && typeof product.attributes === 'object'
          ? { ...(product.attributes as any) }
          : {};
      const next = { ...existing, ...nextAttributes };
      const sanitized = this.sanitizeVehicleAttributesForCategory(
        next,
        effectiveCategory,
      );
      product.attributes =
        sanitized && Object.keys(sanitized).length ? sanitized : null;
    }
    // Accept top-level dto.videoUrl during update as well
    if (
      (dto as any) &&
      typeof (dto as any).videoUrl === 'string' &&
      (dto as any).videoUrl
    ) {
      const base =
        product.attributes && typeof product.attributes === 'object'
          ? { ...(product.attributes as any) }
          : {};
      base.videoUrl = (dto as any).videoUrl;
      product.attributes = base;
    }
    // Accept top-level dto.posterUrl during update as well
    if (
      (dto as any) &&
      typeof (dto as any).posterUrl === 'string' &&
      (dto as any).posterUrl
    ) {
      const base =
        product.attributes && typeof product.attributes === 'object'
          ? { ...(product.attributes as any) }
          : {};
      base.posterUrl = (dto as any).posterUrl;
      product.attributes = base;
    }
    // Accept top-level dto.downloadKey during update as well
    if (
      (dto as any) &&
      typeof (dto as any).downloadKey === 'string' &&
      (dto as any).downloadKey
    ) {
      const base =
        product.attributes && typeof product.attributes === 'object'
          ? { ...(product.attributes as any) }
          : {};
      base.downloadKey = (dto as any).downloadKey;
      product.attributes = base;
    }
    // Accept top-level dto.downloadUrl during update as well
    if (
      (dto as any) &&
      typeof (dto as any).downloadUrl === 'string' &&
      (dto as any).downloadUrl
    ) {
      const base =
        product.attributes && typeof product.attributes === 'object'
          ? { ...(product.attributes as any) }
          : {};
      base.downloadUrl = (dto as any).downloadUrl;
      product.attributes = base;
    }
    // Accept top-level dto.isFree during update
    if ((dto as any) && typeof (dto as any).isFree === 'boolean') {
      const base =
        product.attributes && typeof product.attributes === 'object'
          ? { ...(product.attributes as any) }
          : {};
      base.isFree = !!(dto as any).isFree;
      product.attributes = base;
    }

    if (product.attributes && typeof product.attributes === 'object') {
      product.attributes = this.sanitizeVehicleAttributesForCategory(
        product.attributes as any,
        effectiveCategory,
      ) as any;
    }

    // Normalize & validate digital schema after merges (update path)
    if (product.attributes && typeof product.attributes === 'object') {
      if (product.productType !== 'digital') {
        product.attributes = this.stripInvalidDigitalHintsForNonDigital(
          product.attributes as any,
        ) as any;
      }

      try {
        const attrs = product.attributes as any;
        const hasExplicitDigitalHints = this.hasValidDigitalHints(attrs);
        const shouldProcessDigital =
          product.productType === 'digital' || hasExplicitDigitalHints;
        if (!shouldProcessDigital) {
          this.logger.debug(
            'Normalize digital attributes (update) skipped for non-digital product with no valid digital hints',
          );
          throw new Error('DIGITAL_INFERENCE_SKIP_SENTINEL');
        }
        const before = JSON.stringify(product.attributes);
        const { updated, inferredType } = normalizeDigitalAttributes(
          product.attributes as any,
        );
        product.attributes = updated;
        const after = JSON.stringify(product.attributes);
        if (before !== after) {
          this.logger.debug(
            `Normalized digital attributes (update id=${productId}) ${before} -> ${after}`,
          );
        }
        if (inferredType === 'digital') product.productType = 'digital' as any;
        else if (!product.productType && product.listingType)
          product.productType = 'property' as any;
        if (product.productType === 'digital') {
          try {
            validateDigitalStructure(product.attributes as any, {
              requireKey: true,
              maxSizeBytes: 100 * 1024 * 1024,
            });
          } catch (e: any) {
            const { code, message } = mapDigitalError(String(e?.message || ''));
            throw new ForbiddenException({ error: message, code });
          }
        }
      } catch (err) {
        if (err?.message !== 'DIGITAL_INFERENCE_SKIP_SENTINEL') {
          this.logger.debug(
            `Normalize digital attributes (update) skipped due to error: ${String(err?.message || err)}`,
          );
        }
      }
    }

    // Update tags by names if provided
    if (Array.isArray(tags)) {
      const tagNames: string[] = tags
        .map((t: any) => (typeof t === 'string' ? t.trim() : ''))
        .filter((s: string) => !!s);
      const existing = tagNames.length
        ? await this.tagRepository.find({
            where: { name: In(tagNames) } as any,
          })
        : [];
      const existingNames = new Set(existing.map((t: any) => t.name));
      const toCreate = tagNames.filter((n) => !existingNames.has(n));
      const created = toCreate.length
        ? await this.tagRepository.save(
            toCreate.map((name) => this.tagRepository.create({ name })),
          )
        : [];
      (product as any).tags = [...existing, ...created];
    }

    // Update category if it was sent
    if (typeof categoryId !== 'undefined') {
      product.category = effectiveCategory;
    }

    // Update images if they were sent (delete old ones, add new ones)
    if (images) {
      product.imageUrl = images.length > 0 ? images[0].src : null;

      // Get currently stored images to handle ID preservation and cleanup
      const existingImages = await this.productImageRepository.find({
        where: { product: { id: productId } },
      });

      const existingIds = new Set(existingImages.map((img) => img.id));

      // Determine which IDs from the payload are valid (exist in DB)
      // If payload has an ID that is NOT in existingIds, strip it (treat as new)
      const sanitizedImages = images.map((img, index) => {
        const isExisting = img.id && existingIds.has(Number(img.id));
        return this.productImageRepository.create({
          ...img,
          id: isExisting ? img.id : undefined, // Strip invalid/fake IDs
          product,
          sortOrder: index,
        });
      });

      // Determine IDs to delete (in DB but not in payload)
      const payloadIds = new Set(
        sanitizedImages.filter((img) => img.id).map((img) => img.id),
      );
      const idsToDelete = existingImages
        .filter((img) => !payloadIds.has(img.id))
        .map((img) => img.id);

      if (idsToDelete.length > 0) {
        await this.productImageRepository.delete(idsToDelete);
      }

      // Save (Update existing, Insert new)
      const savedImages =
        await this.productImageRepository.save(sanitizedImages);
      product.images = savedImages;
    }

    await this.productRepository.save(product);
    return this.productRepository.findOneOrFail({
      where: { id: productId },
      relations: ['images', 'vendor', 'category', 'tags'],
    });
  }

  async deleteMyProduct(
    userId: number,
    productId: number,
  ): Promise<{ deleted: boolean }> {
    const product = await this.productRepository.findOne({
      where: { id: productId, vendor: { id: userId } },
    });
    if (!product) {
      throw new NotFoundException('Product not found or not owned by user');
    }
    // Soft delete to preserve integrity
    await this.productRepository.update(productId, { deletedAt: new Date() });

    // Legacy cleanup if needed (e.g. reports) - though soft delete keeps product, so reports might stay?
    // If we want to hide reviews/etc for soft-deleted products, we rely on product.deleted_at checks in those queries.
    // Keeping manual delete of reports as it was there?
    // User reports on a deleted product might be irrelevant.
    // await this.userReportRepository.delete({ product: { id: productId } });
    // Leaving existing logic but replacing hard delete with soft update

    return { deleted: true };
  }

  // Fetch a single product owned by the vendor (for edit prefill)
  async getMyProduct(
    userId: number,
    productId: number,
    opts?: { playable?: boolean; ttlSecs?: number },
  ): Promise<Product & { playableUrl?: string; playableExpiresIn?: number }> {
    const product = await this.productRepository.findOne({
      where: { id: productId, vendor: { id: userId } },
      relations: ['images', 'category', 'tags', 'vendor'],
    });
    if (!product) {
      throw new NotFoundException('Product not found or not owned by user');
    }

    try {
      const hasColumns = await this.hasPrivateNoteColumns();
      if (hasColumns) {
        const noteRow = await this.productRepository
          .createQueryBuilder('product')
          .select('product.private_note', 'private_note')
          .addSelect(
            'product.private_note_updated_at',
            'private_note_updated_at',
          )
          .addSelect(
            'product.private_note_updated_by_id',
            'private_note_updated_by_id',
          )
          .addSelect(
            'product.private_note_updated_by_name',
            'private_note_updated_by_name',
          )
          .where('product.id = :productId', { productId })
          .andWhere('product.vendorId = :userId', { userId })
          .getRawOne<{
            private_note: string | null;
            private_note_updated_at: Date | string | null;
            private_note_updated_by_id: string | null;
            private_note_updated_by_name: string | null;
          }>();

        if (noteRow) {
          (product as any).privateNote = noteRow.private_note || null;
          (product as any).hasInternalNote =
            !!noteRow.private_note && !!String(noteRow.private_note).trim();
          (product as any).privateNoteUpdatedAt =
            noteRow.private_note_updated_at
              ? new Date(noteRow.private_note_updated_at)
              : null;
          (product as any).privateNoteUpdatedById =
            noteRow.private_note_updated_by_id
              ? Number(noteRow.private_note_updated_by_id)
              : null;
          (product as any).privateNoteUpdatedByName =
            noteRow.private_note_updated_by_name || null;
        }
      }
    } catch (err) {
      this.logger.debug(
        'Failed to load internal note for product',
        err as Error,
      );
    }

    try {
      const out = normalizeProductMedia(product as any);

      // Ensure digital alias fields are present for edit prefills
      try {
        const ensureDigitalAliases = (obj: any) => {
          if (!obj) return;
          let attrs =
            obj.attributes && typeof obj.attributes === 'object'
              ? (obj.attributes as Record<string, any>)
              : undefined;
          if (!attrs) return;

          const isExplicitDigital =
            String(obj.productType || '').toLowerCase() === 'digital';
          if (!isExplicitDigital) {
            attrs =
              this.stripInvalidDigitalHintsForNonDigital(attrs) || ({} as any);
          }
          const hasDigitalHints = this.hasValidDigitalHints(attrs);
          if (!isExplicitDigital && !hasDigitalHints) {
            obj.attributes = attrs;
            return;
          }

          // First, normalize into canonical digital structure if applicable
          try {
            const { updated } = normalizeDigitalAttributes(attrs);
            if (updated && typeof updated === 'object') attrs = updated;
          } catch (err) {
            this.logger.debug(
              'Digital alias normalization skipped',
              err as Error,
            );
          }

          // Read canonical digital structure if present
          const dig =
            (attrs as any).digital && typeof (attrs as any).digital === 'object'
              ? (attrs as any).digital
              : undefined;
          const dl =
            dig && typeof dig.download === 'object'
              ? (dig.download as Record<string, any>)
              : undefined;

          // Fallback to downloadKey present at root attrs if canonical missing
          let key: string | undefined =
            (dl?.key as string) ||
            (attrs.downloadKey as string) ||
            obj.downloadKey;
          // Derive key from an existing downloadUrl (or legacy url/src) if needed
          const urlCandidate: string | undefined =
            typeof attrs.downloadUrl === 'string' && attrs.downloadUrl
              ? attrs.downloadUrl
              : typeof (attrs as any).url === 'string' && (attrs as any).url
                ? (attrs as any).url
                : typeof (attrs as any).src === 'string' && (attrs as any).src
                  ? (attrs as any).src
                  : undefined;
          if (!key && urlCandidate) {
            try {
              key = this.doSpacesService.extractKeyFromUrl(urlCandidate) || key;
            } catch (err) {
              this.logger.debug('Failed to derive key from URL', err as Error);
            }
          }

          // Derive/choose public URL
          let publicUrl: string | undefined =
            (dl?.publicUrl as string) ||
            (attrs.downloadUrl as string) ||
            (attrs as any).url ||
            (attrs as any).src;
          if (!publicUrl && typeof key === 'string' && key) {
            const bucket = process.env.DO_SPACES_BUCKET;
            const region = process.env.DO_SPACES_REGION;
            if (bucket && region) {
              publicUrl = `https://${bucket}.${region}.digitaloceanspaces.com/${key}`;
            }
          }

          // Backfill alias fields when missing
          if (!attrs.downloadUrl && publicUrl) attrs.downloadUrl = publicUrl;
          // Ensure root-level downloadKey alias for prefill
          if (
            !attrs.downloadKey &&
            typeof ((dl?.key as string) || key) === 'string' &&
            ((dl?.key as string) || key)
          ) {
            attrs.downloadKey = (dl?.key as string) || key;
          }

          // format alias from key extension
          if (!attrs.format) {
            const from =
              (dl?.key as string) ||
              key ||
              (typeof attrs.downloadUrl === 'string' ? attrs.downloadUrl : '');
            const ext = String(from.split('.').pop() || '').toLowerCase();
            if (ext === 'pdf' || ext === 'epub' || ext === 'zip') {
              attrs.format = ext.toUpperCase();
            }
          }

          // fileSizeMB from bytes if available
          if (
            !attrs.fileSizeMB &&
            typeof dl?.size === 'number' &&
            isFinite(dl.size)
          ) {
            const mb = dl.size / (1024 * 1024);
            if (mb > 0) attrs.fileSizeMB = Math.round(mb * 100) / 100;
          }

          // licenseRequired alias
          if (
            typeof attrs.licenseRequired === 'undefined' &&
            typeof dl?.licenseRequired === 'boolean'
          ) {
            attrs.licenseRequired = dl.licenseRequired;
          }

          // Expose a generic `file` alias object for edit UI expecting file/url shape
          // Do this only at read-time (do not persist), safe for prefill forms
          if (
            typeof (attrs as any).file === 'undefined' &&
            (publicUrl || key)
          ) {
            const filename =
              (dl?.filename as string) ||
              (typeof ((dl?.key as string) || key) === 'string'
                ? String((dl?.key as string) || key)
                    .split('/')
                    .pop()
                : undefined);
            const sizeMB =
              typeof attrs.fileSizeMB === 'number' && isFinite(attrs.fileSizeMB)
                ? attrs.fileSizeMB
                : typeof dl?.size === 'number' &&
                    isFinite(dl.size) &&
                    dl.size > 0
                  ? Math.round((dl.size / (1024 * 1024)) * 100) / 100
                  : undefined;
            (attrs as any).file = {
              url: publicUrl,
              src: publicUrl,
              name: filename,
              key: (dl?.key as string) || key,
              size: typeof dl?.size === 'number' ? dl.size : undefined,
              sizeMB,
              contentType: dl?.contentType,
            };
          }
          // Also expose files array form if missing
          if (
            typeof (attrs as any).files === 'undefined' &&
            (attrs as any).file
          ) {
            (attrs as any).files = [(attrs as any).file];
          }

          obj.attributes = attrs; // assign back (possibly updated reference)
        };
        ensureDigitalAliases(out);
        if (out.attributes && typeof out.attributes === 'object') {
          out.attributes = this.sanitizeVehicleAttributesForCategory(
            out.attributes,
            out.category || null,
          );
        }

        // Log attribute keys for troubleshooting prefill (use .log for visibility in prod)
        try {
          const attrs =
            out.attributes && typeof out.attributes === 'object'
              ? (out.attributes as Record<string, any>)
              : undefined;
          const dig =
            attrs && typeof attrs.digital === 'object'
              ? attrs.digital
              : undefined;
          const dl =
            dig && typeof dig.download === 'object' ? dig.download : undefined;
          const preview = {
            keys: attrs ? Object.keys(attrs) : [],
            hasDigital: !!dig,
            digitalKeys: dig ? Object.keys(dig) : [],
            hasDownload: !!dl,
            downloadKeys: dl ? Object.keys(dl) : [],
            downloadKey:
              (attrs as any)?.downloadKey || dl?.key || out.downloadKey || null,
            downloadUrl: (attrs as any)?.downloadUrl || dl?.publicUrl || null,
            format: (attrs as any)?.format || null,
            fileSizeMB: (attrs as any)?.fileSizeMB || null,
            licenseRequired: (attrs as any)?.licenseRequired ?? null,
          } as any;
          this.logger.log(
            `getMyProduct prefill id=${productId} attrs=${JSON.stringify(preview)}`,
          );
          // Optional deep attributes dump for specific IDs via env flag (comma-separated or 'all')
          try {
            const dbg = (process.env.DEBUG_ATTRS_PRODUCT_IDS || '').trim();
            if (dbg) {
              const should =
                dbg === 'all' ||
                dbg
                  .split(',')
                  .map((s) => parseInt(s.trim(), 10))
                  .filter((n) => !isNaN(n))
                  .includes(productId);
              if (should) {
                const raw = attrs ? JSON.stringify(attrs) : 'null';
                this.logger.warn(`DEBUG rawAttrs id=${productId} attrs=${raw}`);
              }
            }
          } catch (err) {
            this.logger.debug('Attrs debug flag handling failed', err as Error);
          }
        } catch (err) {
          this.logger.debug('Attrs cleanup failed (inner)', err as Error);
        }
      } catch (err) {
        this.logger.debug('Attrs cleanup failed (outer)', err as Error);
      }
      // Optional: attach a short-lived signed playback URL for the video to simplify clients
      if (opts?.playable) {
        const v: string | undefined =
          out.videoUrl || (out.attributes?.videoUrl as string | undefined);
        if (typeof v === 'string' && v) {
          const key = this.doSpacesService.extractKeyFromUrl(v);
          if (key) {
            const ttl = Math.max(60, Math.min(opts.ttlSecs || 300, 3600));
            const ext = (key.split('.').pop() || '').toLowerCase();
            const mime =
              ext === 'mp4'
                ? 'video/mp4'
                : ext === 'webm'
                  ? 'video/webm'
                  : ext === 'mov'
                    ? 'video/quicktime'
                    : undefined;
            const fileName = key.split('/').pop();
            out.playableUrl = await this.doSpacesService.getSignedUrl(
              key,
              ttl,
              {
                contentType: mime,
                inlineFilename: fileName,
              },
            );
            out.playableExpiresIn = ttl;
          }
        }
      }
      return {
        ...out,
        listedBy: this.resolveListedBy(out),
      };
    } catch {
      return {
        ...(product as any),
        listedBy: this.resolveListedBy(product as any),
      };
    }
  }

  async getSalesGraphData(vendorId: number, range: string, status?: string) {
    const startDate = new Date();
    const r = String(range || '').toLowerCase();
    if (r === '365d') startDate.setDate(startDate.getDate() - 365);
    else if (r === '90d') startDate.setDate(startDate.getDate() - 90);
    else if (r === '30d') startDate.setDate(startDate.getDate() - 30);
    else if (r === '7d') startDate.setDate(startDate.getDate() - 7);
    else startDate.setDate(startDate.getDate() - 30);

    let statuses = [
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ];

    if (status) {
      // If a specific status is requested (e.g. DELIVERED), use only that
      // Map string status to OrderStatus enum if needed, or just pass it if it matches
      const s = status.toUpperCase();
      if (Object.values(OrderStatus).includes(s as OrderStatus)) {
        statuses = [s as OrderStatus];
      }
    }

    const salesData = await this.orderRepository
      .createQueryBuilder('o')
      .innerJoin('o.items', 'orderItem')
      .innerJoin('orderItem.product', 'product')
      .where('product.vendorId = :vendorId', { vendorId })
      .andWhere('o.createdAt >= :startDate', { startDate })
      .andWhere('o.status IN (:...statuses)', {
        statuses,
      })
      .select('DATE(o.createdAt)', 'date')
      .addSelect('SUM(orderItem.price * orderItem.quantity)', 'total')
      .addSelect('COUNT(DISTINCT o.id)', 'orderCount')
      .groupBy('DATE(o.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return salesData.map((point) => ({
      date: point.date,
      total: parseFloat(point.total) || 0,
      orderCount: parseInt(point.orderCount, 10) || 0,
    }));
  }

  // Your other public and dashboard methods remain here...
  async findPublicVendors(
    findAllVendorsDto: FindAllVendorsDto & {
      sort?: 'name' | 'recent' | 'popular' | 'verifiedAt';
      verificationStatus?: 'APPROVED' | 'PENDING' | 'REJECTED';
      role?: 'VENDOR';
      country?: string;
      region?: string;
      city?: string;
      subscriptionTier?: 'free' | 'pro';
      certificationStatus?: 'certified' | 'uncertified';
      minSales?: number;
      minRating?: number;
      skipRoleFilter?: boolean;
      withProductsOnly?: boolean;
      minPublishedProducts?: number;
    },
  ): Promise<{
    items: any[];
    total: number;
    currentPage: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 10,
      search,
      sort = 'recent',
      verificationStatus,
      country,
      region,
      city,
      subscriptionTier,
      certificationStatus,
      minSales,
      minRating,
      skipRoleFilter,
      withProductsOnly,
      minPublishedProducts,
    } = findAllVendorsDto;
    const skip = (page - 1) * limit;

    const qb = this.userRepository
      .createQueryBuilder('u')
      .select([
        'u.id',
        'u.displayName',
        'u.storeName',
        'u.avatarUrl',
        'u.verificationStatus',
        'u.verified',
        'u.rating',
        'u.numberOfSales',
        'u.verifiedAt',
        'u.createdAt',
        'u.supportedCurrencies',
        'u.registrationCountry',
        'u.registrationCity',
        'u.subscriptionTier',
        'u.subscriptionExpiry',
      ]);

    if (!skipRoleFilter) {
      qb.andWhere(':role = ANY(u.roles)', { role: UserRole.VENDOR }).andWhere(
        'u."isActive" = true',
      );
    }

    if (verificationStatus) {
      qb.andWhere('u."verificationStatus" = :verificationStatus', {
        verificationStatus,
      });
    }

    if (certificationStatus) {
      const normalized = certificationStatus.toLowerCase();
      const shouldBeVerified = normalized === CertificationStatus.CERTIFIED;
      qb.andWhere('u.verified = :shouldBeVerified', { shouldBeVerified });
    }

    if (subscriptionTier) {
      qb.andWhere('LOWER(COALESCE(u."subscriptionTier", \'\')) = :tier', {
        tier: subscriptionTier.toLowerCase(),
      });
    }

    if (country) {
      qb.andWhere(
        'LOWER(COALESCE(u."registrationCountry", \'\')) = LOWER(:country)',
        {
          country,
        },
      );
    }
    if (region) {
      qb.andWhere(
        'LOWER(COALESCE(u."registrationRegion", \'\')) = LOWER(:region)',
        {
          region,
        },
      );
    }
    if (city) {
      qb.andWhere(
        'LOWER(COALESCE(u."registrationCity", \'\')) = LOWER(:city)',
        {
          city,
        },
      );
    }

    if (typeof minSales === 'number' && !Number.isNaN(minSales)) {
      qb.andWhere('COALESCE(u."numberOfSales", 0) >= :minSales', {
        minSales: Number(minSales),
      });
    }
    if (typeof minRating === 'number' && !Number.isNaN(minRating)) {
      qb.andWhere('COALESCE(u.rating, 0) >= :minRating', {
        minRating: Number(minRating),
      });
    }

    const term = typeof search === 'string' ? search.trim() : '';
    if (term) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('u."displayName" ILIKE :term', { term: `%${term}%` })
            .orWhere('u."storeName" ILIKE :term', { term: `%${term}%` })
            .orWhere('u.email ILIKE :term', { term: `%${term}%` })
            .orWhere('u."phoneNumber" ILIKE :term', { term: `%${term}%` })
            .orWhere('u."vendorPhoneNumber" ILIKE :term', {
              term: `%${term}%`,
            });

          if (!Number.isNaN(Number(term))) {
            subQb.orWhere('u.id = :searchId', { searchId: Number(term) });
          }
        }),
      );
    }

    const shouldHideEmptyVendors = withProductsOnly ?? !skipRoleFilter;
    if (shouldHideEmptyVendors) {
      const minProducts = Math.max(1, Number(minPublishedProducts) || 1);
      qb.andWhere(
        `(
          SELECT COUNT(1)
          FROM product p
          WHERE p."vendorId" = u.id
            AND p.status = :publishedStatus
            AND p.deleted_at IS NULL
        ) >= :minProducts`,
        { publishedStatus: 'publish', minProducts },
      );
    }

    const nameOrderExpr =
      'LOWER(COALESCE(u."storeName", u."displayName", \'\'))';
    const latestPublishedProductExpr = `(
      SELECT MAX(p2."createdAt")
      FROM product p2
      WHERE p2."vendorId" = u.id
        AND p2.status = :publishedStatus
        AND p2.deleted_at IS NULL
    )`;
    const publishedProductCountExpr = `(
      SELECT COUNT(1)
      FROM product p3
      WHERE p3."vendorId" = u.id
        AND p3.status = :publishedStatus
        AND p3.deleted_at IS NULL
    )`;
    if (sort === 'name') {
      qb.orderBy(nameOrderExpr, 'ASC');
    } else if (sort === 'verifiedAt') {
      qb.orderBy('u."verifiedAt"', 'DESC', 'NULLS LAST').addOrderBy(
        nameOrderExpr,
        'ASC',
      );
    } else if (sort === 'popular') {
      qb.orderBy(publishedProductCountExpr, 'DESC')
        .addOrderBy('u."numberOfSales"', 'DESC', 'NULLS LAST')
        .addOrderBy(nameOrderExpr, 'ASC');
    } else {
      if (shouldHideEmptyVendors) {
        qb.orderBy(latestPublishedProductExpr, 'DESC', 'NULLS LAST').addOrderBy(
          nameOrderExpr,
          'ASC',
        );
      } else {
        qb.orderBy('u."createdAt"', 'DESC').addOrderBy(nameOrderExpr, 'ASC');
      }
    }

    const [users, total] = await qb.take(limit).skip(skip).getManyAndCount();

    const items = users.map((u) => {
      let yearsOnPlatform: string | number | null = null;
      if (u.verified && u.verifiedAt) {
        const now = new Date();
        const start = new Date(u.verifiedAt);
        const diffMs = now.getTime() - start.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 30) {
          yearsOnPlatform = `${Math.max(0, diffDays)} Days`;
        } else if (diffDays < 365) {
          const m = Math.max(1, Math.floor(diffDays / 30.44));
          yearsOnPlatform = `${m} Month${m !== 1 ? 's' : ''}`;
        } else {
          yearsOnPlatform = (diffDays / 365.25).toFixed(1) + ' Years';
        }
      }

      return {
        id: u.id,
        displayName: u.displayName,
        storeName: u.storeName,
        avatarUrl: u.avatarUrl,
        verificationStatus: u.verificationStatus,
        isVerified: !!u.verified,
        rating: u.rating ?? 0,
        salesCount: Number((u as any).numberOfSales ?? 0),
        numberOfSales: Number((u as any).numberOfSales ?? 0),
        createdAt: u.createdAt,
        yearsOnPlatform,
        subscriptionTier: isCertifiedVendor(u)
          ? SubscriptionTier.PRO
          : (u as any).subscriptionTier || SubscriptionTier.FREE,
        subscriptionExpiry: (u as any).subscriptionExpiry || null,
        certificationStatus: resolveCertificationStatus(u),
        isCertified: isCertifiedVendor(u),
        productCount: undefined, // placeholder; can join or compute later
        certificateCount: Array.isArray((u as any).verificationDocuments)
          ? (u as any).verificationDocuments.length
          : undefined,
      };
    });

    return {
      items,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
    };
  }
  async getPublicProfile(userId: number) {
    // ... (Your existing code is preserved)
    const user = await this.userRepository
      .createQueryBuilder('u')
      .where('u.id = :id', { id: userId })
      .andWhere(':role = ANY(u.roles)', { role: UserRole.VENDOR })
      .getOne();
    if (!user) return null;
    const {
      id,
      storeName,
      avatarUrl,
      displayName,
      createdAt,
      bankName,
      bankAccountNumber,
      bankAccountHolderName,
      mobileMoneyNumber,
      mobileMoneyProvider,
      verified,
      verificationStatus,
      subscriptionTier,
      verifiedAt,
    } = user as any;

    let yearsOnPlatform: string | number | null = null;
    if (verified && verifiedAt) {
      const now = new Date();
      const start = new Date(verifiedAt);
      const diffMs = now.getTime() - start.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 30) {
        yearsOnPlatform = `${Math.max(0, diffDays)} Days`;
      } else if (diffDays < 365) {
        const m = Math.max(1, Math.floor(diffDays / 30.44));
        yearsOnPlatform = `${m} Month${m !== 1 ? 's' : ''}`;
      } else {
        yearsOnPlatform = (diffDays / 365.25).toFixed(1) + ' Years';
      }
    }

    const certificationStatus = resolveCertificationStatus({
      verified,
      verificationStatus,
    });

    return {
      id,
      storeName,
      avatarUrl,
      displayName,
      createdAt,
      yearsOnPlatform,
      bankName: bankName || '',
      bankAccountNumber: bankAccountNumber || '',
      bankAccountHolderName: bankAccountHolderName || '',
      mobileMoneyNumber: mobileMoneyNumber || '',
      mobileMoneyProvider: mobileMoneyProvider || '',
      verified: !!verified,
      verificationStatus: verificationStatus || 'UNVERIFIED',
      certificationStatus,
      isCertified: isCertifiedVendor({ verified, verificationStatus }),
      subscriptionTier: subscriptionTier || 'free',
    };
  }

  async getDashboardOverview(userId: number, status?: string) {
    const startedAt = Date.now();

    let statuses = [
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ];

    if (status) {
      const s = status.toUpperCase();
      if (s === 'FAILED') {
        statuses = [
          OrderStatus.CANCELLED,
          OrderStatus.CANCELLED_BY_BUYER,
          OrderStatus.CANCELLED_BY_SELLER,
          OrderStatus.DELIVERY_FAILED,
        ];
      } else if (Object.values(OrderStatus).includes(s as OrderStatus)) {
        statuses = [s as OrderStatus];
      }
    }

    const queryStartedAt = Date.now();
    const [productCount, orderAgg] = await Promise.all([
      this.productRepository.count({
        where: { vendor: { id: userId }, deletedAt: IsNull() },
      }),
      this.orderRepository
        .createQueryBuilder('order')
        .innerJoin('order.items', 'orderItem')
        .innerJoin('orderItem.product', 'product')
        .where('product.vendorId = :userId', { userId })
        .andWhere('order.status IN (:...statuses)', {
          statuses,
        })
        .select('COUNT(DISTINCT "order"."id")', 'orderCount')
        .addSelect(
          'COALESCE(SUM(orderItem.price * orderItem.quantity), 0)',
          'totalSales',
        )
        .getRawOne<{ orderCount: string; totalSales: string }>(),
    ]);
    const queryMs = Date.now() - queryStartedAt;

    const orderCount = Number(orderAgg?.orderCount || 0);
    const totalSales = parseFloat(orderAgg?.totalSales || '0') || 0;
    const totalMs = Date.now() - startedAt;
    this.logger.log(
      `[getDashboardOverview] userId=${userId} queryMs=${queryMs} totalMs=${totalMs} productCount=${productCount} orderCount=${orderCount}`,
    );
    if (totalMs > 800) {
      this.logger.warn(
        `[getDashboardOverview] Slow response userId=${userId} totalMs=${totalMs}`,
      );
    }

    return {
      productCount,
      orderCount,
      totalSales,
    };
  }
  async getVendorProducts(userId: number, currency?: string, search?: string) {
    const startedAt = Date.now();
    const target = this.normalizeCurrency(currency);
    this.logger.debug(
      `Vendor products currency normalized: requested=${currency} applied=${target}`,
    );
    // Eagerly load product relations
    const where: any = { vendor: { id: userId }, deletedAt: IsNull() };
    if (search && search.trim().length > 0) {
      where.name = ILike(`%${search.trim()}%`);
    }

    if (!search || !search.trim().length) {
      const hasAnyStartedAt = Date.now();
      const hasAny = await this.productRepository
        .createQueryBuilder('product')
        .select('1')
        .where('product.vendorId = :userId', { userId })
        .andWhere('product.deletedAt IS NULL')
        .limit(1)
        .getRawOne();
      const hasAnyMs = Date.now() - hasAnyStartedAt;
      if (!hasAny) {
        const totalMs = Date.now() - startedAt;
        this.logger.log(
          `[getVendorProducts] userId=${userId} fast-empty=true hasAnyMs=${hasAnyMs} totalMs=${totalMs}`,
        );
        return [];
      }
    }

    const fetchStartedAt = Date.now();
    const products = await this.productRepository.find({
      where,
      relations: ['images', 'category', 'tags'],
    });
    const fetchMs = Date.now() - fetchStartedAt;
    try {
      const transformStartedAt = Date.now();
      const normalized = Array.isArray(products)
        ? products.map(normalizeProductMedia)
        : [];
      let converted = this.applyCurrencyToProducts(normalized, target);
      converted = this.attachListedBy(converted as any[]) as any;
      const noteMap = await this.getInternalNoteMap(
        userId,
        converted.map((item: any) => Number(item?.id || 0)),
      );
      const result = converted.map((item: any) => {
        const noteMeta = noteMap.get(Number(item?.id || 0));
        return {
          ...item,
          hasInternalNote: !!noteMeta?.hasInternalNote,
          privateNoteUpdatedAt: noteMeta?.privateNoteUpdatedAt || null,
          privateNoteUpdatedById: noteMeta?.privateNoteUpdatedById || null,
          privateNoteUpdatedByName: noteMeta?.privateNoteUpdatedByName || null,
        };
      });
      const transformMs = Date.now() - transformStartedAt;
      const totalMs = Date.now() - startedAt;
      this.logger.log(
        `[getVendorProducts] userId=${userId} count=${result.length} fetchMs=${fetchMs} transformMs=${transformMs} totalMs=${totalMs}`,
      );
      if (totalMs > 900) {
        this.logger.warn(
          `[getVendorProducts] Slow response userId=${userId} count=${result.length} totalMs=${totalMs}`,
        );
      }
      return result;
    } catch {
      let converted = this.applyCurrencyToProducts(
        Array.isArray(products) ? products : [],
        target,
      );
      converted = this.attachListedBy(converted as any[]) as any;
      const noteMap = await this.getInternalNoteMap(
        userId,
        converted.map((item: any) => Number(item?.id || 0)),
      );
      const result = converted.map((item: any) => {
        const noteMeta = noteMap.get(Number(item?.id || 0));
        return {
          ...item,
          hasInternalNote: !!noteMeta?.hasInternalNote,
          privateNoteUpdatedAt: noteMeta?.privateNoteUpdatedAt || null,
          privateNoteUpdatedById: noteMeta?.privateNoteUpdatedById || null,
          privateNoteUpdatedByName: noteMeta?.privateNoteUpdatedByName || null,
        };
      });
      const totalMs = Date.now() - startedAt;
      this.logger.log(
        `[getVendorProducts] userId=${userId} count=${result.length} fetchMs=${fetchMs} totalMs=${totalMs} path=fallback`,
      );
      if (totalMs > 900) {
        this.logger.warn(
          `[getVendorProducts] Slow response userId=${userId} count=${result.length} totalMs=${totalMs} path=fallback`,
        );
      }
      return result;
    }
  }

  // Managed list with filters for MyProductsScreen
  async getVendorProductsManage(
    userId: number,
    q: import('./dto/vendor-products-query.dto').VendorProductsQueryDto,
  ): Promise<{
    items: Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const targetCurrency = this.normalizeCurrency(q?.currency);
    this.logger.debug(
      `Vendor products manage currency normalized: requested=${q?.currency} applied=${targetCurrency}`,
    );
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.tags', 'tags')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .addSelect('product.original_creator_contact')
      .where('product.vendorId = :userId', { userId })
      .andWhere('product.deletedAt IS NULL')
      .skip((page - 1) * limit)
      .take(limit);

    // Sorting
    switch (q.sort) {
      case 'created_asc':
        qb.orderBy('product.createdAt', 'ASC');
        break;
      case 'views_desc':
        qb.orderBy('product.view_count', 'DESC', 'NULLS LAST');
        break;
      case 'views_asc':
        qb.orderBy('product.view_count', 'ASC', 'NULLS LAST');
        break;
      case 'price_asc':
        qb.orderBy('product.price', 'ASC', 'NULLS LAST');
        break;
      case 'price_desc':
        qb.orderBy('product.price', 'DESC', 'NULLS LAST');
        break;
      case 'name_asc':
        qb.orderBy('product.name', 'ASC');
        break;
      case 'name_desc':
        qb.orderBy('product.name', 'DESC');
        break;
      default:
        qb.orderBy('product.createdAt', 'DESC');
    }

    if (q.search) {
      if (await this.hasPrivateNoteColumns()) {
        qb.andWhere(
          '(product.name ILIKE :search OR product.private_note ILIKE :search)',
          {
            search: `%${q.search}%`,
          },
        );
      } else {
        qb.andWhere('product.name ILIKE :search', {
          search: `%${q.search}%`,
        });
      }
    }
    if (q.status === 'published')
      qb.andWhere('product.status = :statusPub', { statusPub: 'publish' });
    if (q.status === 'unpublished') qb.andWhere("product.status <> 'publish'");

    const [raw, total] = await qb.getManyAndCount();
    let items = raw;
    try {
      items = raw.map(normalizeProductMedia);
    } catch {
      // ignore normalization errors and return raw items
    }
    items = this.applyCurrencyToProducts(items, targetCurrency);
    items = this.attachListedBy(items as any[]) as any;

    const noteMap = await this.getInternalNoteMap(
      userId,
      items.map((item) => Number(item.id || 0)),
    );
    items = items.map((item: any) => {
      const noteMeta = noteMap.get(Number(item?.id || 0));
      return {
        ...item,
        hasInternalNote: !!noteMeta?.hasInternalNote,
        privateNoteUpdatedAt: noteMeta?.privateNoteUpdatedAt || null,
        privateNoteUpdatedById: noteMeta?.privateNoteUpdatedById || null,
        privateNoteUpdatedByName: noteMeta?.privateNoteUpdatedByName || null,
      } as Product;
    });

    // [New] Populate recent viewers for featured products
    // This allows the frontend to show avatars on the "My Products" card overlay
    if (items.length > 0) {
      await Promise.all(
        items.map(async (item) => {
          if (item.featured) {
            try {
              const impressions = await this.impressionRepo.find({
                where: {
                  productId: item.id,
                  userId: Raw((alias) => `${alias} IS NOT NULL`),
                },
                relations: ['user'],
                order: { createdAt: 'DESC' },
                take: 30, // fetching enough to filter unique
              });
              const seen = new Set<number>();
              const avatars: string[] = [];
              for (const imp of impressions) {
                if (
                  imp.user &&
                  imp.user.id &&
                  !seen.has(imp.user.id) &&
                  imp.user.avatarUrl
                ) {
                  seen.add(imp.user.id);
                  avatars.push(imp.user.avatarUrl);
                  if (avatars.length >= 4) break; // Limit 4 avatars
                }
              }
              item.featuredRecentViewers = avatars;
            } catch (err) {
              // ignore errors, just don't show avatars
            }
          }
        }),
      );
    }

    const totalPages = Math.ceil(total / limit) || 1;
    return { items, total, page, limit, totalPages };
  }

  async getSales(vendorId: number) {
    const sales = await this.orderRepository.find({
      where: {
        items: {
          product: {
            vendor: {
              id: vendorId,
            },
          },
        },
      },
      relations: ['items', 'items.product', 'user'],
    });
    return sales;
  }

  // Admin detail: profile + stats + recent orders
  async getAdminVendorDetail(userId: number): Promise<{
    profile: any;
    stats: {
      productCount: number;
      orderCount: number;
      salesLast30Total: number;
      salesGraphLast30: Array<{ date: string; total: number }>;
    };
    recentOrders: Array<{
      id: number;
      total: number;
      status: string;
      createdAt: Date;
      items: Array<{
        id: number;
        productId: number;
        productName: string;
        quantity: number;
        price: number;
        status: string;
      }>;
      buyer: {
        id: number;
        email?: string | null;
        displayName?: string | null;
      } | null;
    }>;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Vendor not found');
    if (!Array.isArray(user.roles) || !user.roles.includes(UserRole.VENDOR)) {
      throw new ForbiddenException('User is not a vendor');
    }

    const productCount = await this.productRepository.count({
      where: { vendor: { id: userId } },
    });

    const orderCount = await this.orderRepository
      .createQueryBuilder('order')
      .innerJoin('order.items', 'orderItem')
      .innerJoin('orderItem.product', 'product')
      .where('product.vendor.id = :userId', { userId })
      .getCount();

    const salesGraphLast30 = await this.getSalesGraphData(userId, '30d');
    const salesLast30Total = salesGraphLast30.reduce(
      (sum, d: any) => sum + (Number(d.total) || 0),
      0,
    );

    const { data: recentOrdersRaw } = await this.getVendorOrders(userId, {
      page: 1,
      limit: 5,
    });
    const recentOrders = (recentOrdersRaw || []).map((o: any) => ({
      id: o.id,
      total: Number(o.total) || 0,
      status: o.status,
      createdAt: o.createdAt,
      items: (o.items || []).map((it: any) => ({
        id: it.id,
        productId: it.product?.id,
        productName: it.product?.name,
        quantity: it.quantity,
        price: Number(it.price) || 0,
        status: it.status,
      })),
      buyer: o.user
        ? {
            id: o.user.id,
            email: o.user.email || null,
            displayName: o.user.displayName || null,
          }
        : null,
    }));

    const profile = {
      id: user.id,
      displayName: user.displayName || null,
      storeName: user.storeName || null,
      avatarUrl: user.avatarUrl || null,
      verificationStatus: user.verificationStatus,
      verified: !!user.verified,
      verifiedAt: user.verifiedAt || null,
      isActive: user.isActive,
      rating: user.rating ?? 0,
      numberOfSales: user.numberOfSales ?? 0,
      currency: user.currency || null,
      registrationCountry: user.registrationCountry || null,
      registrationRegion: user.registrationRegion || null,
      registrationCity: user.registrationCity || null,
      createdAt: user.createdAt,
      supportedCurrencies: user.supportedCurrencies || [],
      subscriptionTier: (user as any).subscriptionTier || 'free',
      subscriptionExpiry: (user as any).subscriptionExpiry || null,
      certificationStatus: resolveCertificationStatus(user),
      isCertified: isCertifiedVendor(user),
    };

    return {
      profile,
      stats: { productCount, orderCount, salesLast30Total, salesGraphLast30 },
      recentOrders,
    };
  }

  // Admin: set vendor verification status and toggle verified/verifiedAt fields
  async setVendorVerificationStatus(
    userId: number,
    status: VerificationStatus,
    _reason?: string,
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Vendor with ID ${userId} not found.`);
    }
    // Optional: ensure user has VENDOR role
    if (!Array.isArray(user.roles) || !user.roles.includes(UserRole.VENDOR)) {
      throw new ForbiddenException('User is not a vendor.');
    }

    const oldStatus = user.verificationStatus;

    user.verificationStatus = status;
    if (status === VerificationStatus.APPROVED) {
      user.verified = true;
      user.verifiedAt = new Date();
    } else {
      user.verified = false;
      // Clear verifiedAt for non-approved statuses
      user.verifiedAt = null;
    }
    // Note: reason is currently not persisted; could be logged or stored if schema adds a field.
    const savedUser = await this.userRepository.save(user);

    // Send notifications if status changed
    if (oldStatus !== status) {
      try {
        if (status === VerificationStatus.APPROVED) {
          const subject = 'Your Business Verification has been Approved!';
          const body =
            'Congratulations! Your business verification for Suuq has been approved. You now have full access to vendor features.';

          // In-App
          await this.notificationsService.createAndDispatch({
            userId: user.id,
            title: 'Verification Approved',
            body: body,
            type: NotificationType.ACCOUNT,
            data: { status: 'APPROVED' },
          });

          // Email
          if (user.email) {
            await this.emailService.send({
              to: user.email,
              subject,
              text: body,
              html: `<p>${body}</p>`,
            });
          }
        } else if (status === VerificationStatus.REJECTED) {
          const subject = 'Your Business Verification has been Rejected';
          const reasonText = _reason ? ` Reason: ${_reason}` : '';
          const body = `We regret to inform you that your business verification for Suuq has been rejected.${reasonText}`;

          // In-App
          await this.notificationsService.createAndDispatch({
            userId: user.id,
            title: 'Verification Rejected',
            body: body,
            type: NotificationType.ACCOUNT,
            data: { status: 'REJECTED', reason: _reason },
          });

          // Email
          if (user.email) {
            await this.emailService.send({
              to: user.email,
              subject,
              text: body,
              html: `<p>${body}</p>`,
            });
          }
        }
      } catch (err) {
        this.logger.error(
          `Failed to send verification notification to user ${userId}: ${err}`,
        );
      }
    }

    return savedUser;
  }

  // Admin: activate/deactivate a vendor
  async setVendorActiveState(userId: number, isActive: boolean): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Vendor with ID ${userId} not found.`);
    }
    if (!Array.isArray(user.roles) || !user.roles.includes(UserRole.VENDOR)) {
      throw new ForbiddenException('User is not a vendor.');
    }
    user.isActive = !!isActive;
    return await this.userRepository.save(user);
  }

  /**
   * Search deliverers (users with DELIVERER role). Supports text query on displayName, email, or phone.
   * Returns normalized items: { id, name, email, phone }
   */
  async searchDeliverers(opts: {
    q?: string;
    page?: number;
    limit?: number;
    lat?: number;
    lng?: number;
    radiusKm?: number;
  }): Promise<{
    items: Array<{
      id: number;
      name: string | null;
      email: string | null;
      phone: string | null;
      distanceKm?: number | null;
    }>;
    total: number;
    hasMore?: boolean;
  }> {
    const q = (opts.q || '').trim();
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 20;
    const origin =
      typeof opts.lat === 'number' && typeof opts.lng === 'number'
        ? { lat: Number(opts.lat), lng: Number(opts.lng) }
        : null;
    const radiusKm =
      typeof opts.radiusKm === 'number' && opts.radiusKm > 0
        ? Number(opts.radiusKm)
        : undefined;

    const qb = this.userRepository
      .createQueryBuilder('u')
      .where(':role = ANY(u.roles)', { role: UserRole.DELIVERER })
      .andWhere('u.isActive = true')
      .orderBy('u.displayName', 'ASC');

    if (q) {
      qb.andWhere(
        '(u.displayName ILIKE :q OR u.email ILIKE :q OR u.phoneNumber ILIKE :q)',
        { q: `%${q}%` },
      );
    }

    // Fetch a wider slice if geo filtering is requested, then apply distance/radius/pagination in memory.
    let users: Array<any> = [];
    let total = 0;
    if (origin) {
      // Get a reasonably large pool to sort/filter from; cap at 500 to avoid heavy queries in tests
      users = await qb.take(500).getMany();
      // Compute distance using haversine
      const withDistances = users.map((u) => {
        const lat = u.locationLat as number | null;
        const lng = u.locationLng as number | null;
        const ok = typeof lat === 'number' && typeof lng === 'number';
        const d = ok
          ? this.haversineKm(origin.lat, origin.lng, lat, lng)
          : Number.POSITIVE_INFINITY;
        return { user: u, distanceKm: ok ? d : null };
      });
      // Filter by radius if provided
      const filtered = (
        radiusKm
          ? withDistances.filter(
              (r) => (r.distanceKm ?? Number.POSITIVE_INFINITY) <= radiusKm,
            )
          : withDistances
      )
        // Sort by distance; null/Inf go last
        .sort((a, b) => {
          const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
          const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
          return da - db;
        });
      total = filtered.length;
      const start = (page - 1) * limit;
      const paged = filtered.slice(start, start + limit);
      const items = paged.map(({ user: u, distanceKm }) => ({
        id: u.id,
        name: u.displayName || null,
        email: u.email || null,
        phone: u.phoneNumber || null,
        distanceKm: distanceKm ?? null,
      }));
      return { items, total, hasMore: start + items.length < total };
    }

    // Non-geo path: use DB pagination
    const [dbUsers, dbTotal] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const items = dbUsers.map((u) => ({
      id: u.id,
      name: u.displayName || null,
      email: u.email || null,
      phone: (u as any).phoneNumber || null,
    }));
    return { items, total: dbTotal, hasMore: page * limit < dbTotal };
  }

  // Great-circle distance (Haversine) in kilometers
  private haversineKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Lightweight vendor suggestions for dropdowns/search-as-you-type
  async suggestVendors(
    q?: string,
    limit = 10,
  ): Promise<
    Array<{
      id: number;
      displayName: string | null;
      storeName: string | null;
      avatarUrl: string | null;
    }>
  > {
    const qb = this.userRepository
      .createQueryBuilder('u')
      .where(':role = ANY(u.roles)', { role: UserRole.VENDOR })
      .andWhere('u.isActive = true')
      .orderBy('u.displayName', 'ASC')
      .take(Math.min(Math.max(Number(limit) || 10, 1), 50));

    const term = (q || '').trim();
    if (term) {
      qb.andWhere('(u.displayName ILIKE :q OR u.storeName ILIKE :q)', {
        q: `%${term}%`,
      });
    }

    const users = await qb.getMany();
    return users.map((u) => {
      const displayName = u.displayName || null;
      const storeName = (u as any).storeName || null;
      const name = displayName || storeName || u.email || `Vendor #${u.id}`;
      return {
        id: u.id,
        name, // common label field for dropdowns
        vendorName: name,
        displayName,
        storeName,
        avatarUrl: u.avatarUrl || null,
        email: u.email || null,
        phone: (u as any)?.phoneNumber || null,
      };
    });
  }

  /**
   * Get paginated orders that include ONLY this vendor's products.
   * For safety, we currently restrict updates to orders that are fully owned by the vendor
   * (i.e., all items belong to this vendor). Listing shows all orders containing vendor items;
   * details and updates are validated for ownership.
   */
  async getVendorOrders(
    vendorId: number,
    opts: {
      page?: number;
      limit?: number;
      status?: OrderStatus;
      currency?: string;
    },
  ): Promise<{ data: any[]; total: number }> {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 20;
    const targetCurrency = this.normalizeCurrency(opts.currency);

    // Step 1: Get distinct Order IDs and Total Count
    const qbIds = this.orderRepository
      .createQueryBuilder('o')
      .select(['o.id', 'o.createdAt'])
      .innerJoin('o.items', 'oi')
      .innerJoin('oi.product', 'p')
      .innerJoin('p.vendor', 'v')
      .where('v.id = :vendorId', { vendorId });

    if (opts.status) {
      // Fix for "in.(A,B)" syntax sent by frontend filters
      const statusStr = opts.status as unknown as string;
      const match = statusStr.match && statusStr.match(/^in\.\((.*)\)$/);

      if (match) {
        const statuses = match[1].split(',').map((s) => s.trim());
        if (statuses.length > 0) {
          qbIds.andWhere('o.status IN (:...statuses)', { statuses });
        }
      } else {
        qbIds.andWhere('o.status = :status', { status: opts.status });
      }
    }

    // We need distinct because joins with items multiply rows
    qbIds.distinct(true);

    const total = await qbIds.getCount();

    // Get paginated IDs
    const distinctResult = await qbIds
      .orderBy('o.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany();

    const orderIds = distinctResult.map((r) => r.o_id);

    if (orderIds.length === 0) {
      return { data: [], total };
    }

    // Step 2: Fetch full Order entities
    const orders = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.deliverer', 'deliverer')
      .leftJoinAndSelect('o.user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'productVendor')
      .where('o.id IN (:...ids)', { ids: orderIds })
      .orderBy('o.createdAt', 'DESC')
      .getMany();

    // Filter items to only this vendor's products in the response and expose normalized deliverer fields
    const data = orders.map((o) => {
      const d: any = (o as any).deliverer || null;
      const filteredItems = (o.items || []).filter(
        (it) => (it.product as any)?.vendor?.id === vendorId,
      );
      const itemsWithMedia = filteredItems.map((it: any) => {
        const product: any = it.product || {};
        const images: any[] = Array.isArray(product.images)
          ? product.images
          : [];
        const firstImage = images[0] || {};
        const productImage =
          product.imageUrl || firstImage.thumbnailSrc || firstImage.src || null;
        const productCurrency = product?.currency || 'ETB';
        const { amount: priceConverted, rate } = this.convertPrice(
          it.price,
          productCurrency,
          targetCurrency,
        );
        const priceToUse = priceConverted ?? it.price;
        return {
          ...it,
          price: priceToUse,
          currency: targetCurrency,
          price_display: {
            amount: priceToUse ?? null,
            currency: targetCurrency,
            convertedFrom: productCurrency,
            rate,
          },
          product: {
            ...product,
            image: productImage,
            thumbnail: productImage,
            sku: product.sku ?? null,
          },
        };
      });
      const vendorItemCount = filteredItems.length;
      const vendorSubtotal = itemsWithMedia.reduce((sum, it: any) => {
        const price =
          typeof it.price === 'number' ? it.price : Number(it.price || 0);
        const quantity =
          typeof it.quantity === 'number'
            ? it.quantity
            : Number(it.quantity || 0);
        return sum + price * quantity;
      }, 0);
      const vendorSubtotalDisplay = {
        amount: Math.round(vendorSubtotal * 100) / 100,
        currency: targetCurrency,
        convertedFrom: (filteredItems[0]?.product as any)?.currency || 'ETB',
        rate: itemsWithMedia[0]?.price_display?.rate,
      } as const;
      const statusCounts = filteredItems.reduce(
        (acc: Record<OrderStatus, number>, it: any) => {
          const s: OrderStatus | undefined = it.status;
          if (s) acc[s] = (acc[s] || 0) + 1;
          return acc;
        },
        {} as Record<OrderStatus, number>,
      );
      const summary = {
        overallStatus: this.computeAggregateStatus(filteredItems as any),
        counts: statusCounts,
      };
      const customer: any = (o as any).user || {};
      const customerName =
        customer.displayName || customer.storeName || customer.email || null;
      const customerAvatar = customer.avatarUrl || null;
      const customerPhoneRaw = customer.phoneNumber || null;
      const customerPhone = customerPhoneRaw
        ? `${customer.phoneCountryCode || ''}${customerPhoneRaw}`.trim()
        : null;
      const shipping = (o as any).shippingAddress || {};
      const customerCity = shipping.city || null;
      const customerCountry = shipping.country || null;
      return {
        ...o,
        // Keep the deliverer container for clients that look for it
        deliverer: d,
        // Normalized convenience fields for parsers
        delivererId: d?.id ?? null,
        delivererName: d?.displayName ?? null,
        delivererEmail: d?.email ?? null,
        delivererPhone: d?.phoneNumber ?? null,
        // Aliased summary object commonly used by mobile apps
        assignedDeliverer: d
          ? {
              id: d.id,
              name: d.displayName ?? null,
              email: d.email ?? null,
              phone: d?.phoneNumber ?? null,
            }
          : null,
        // Additional alias
        delivererSummary: d
          ? {
              id: d.id,
              name: d.displayName ?? null,
              email: d.email ?? null,
              phone: d?.phoneNumber ?? null,
            }
          : null,
        items: itemsWithMedia,
        vendorItemCount,
        vendorSubtotal,
        statusSummary: summary,
        customerName,
        customerAvatar,
        customerPhone,
        customerContactAllowed: !!customerPhone,
        customerCity,
        customerCountry,
        currency: targetCurrency,
        vendorSubtotal_display: vendorSubtotalDisplay,
        total_display: vendorSubtotalDisplay,
      };
    });

    return { data, total };
  }

  async getVendorOrder(vendorId: number, orderId: number, currency?: string) {
    const targetCurrency = this.normalizeCurrency(currency);
    this.logger.debug(
      `Vendor order currency normalized: requested=${currency} applied=${targetCurrency}`,
    );
    const order = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.deliverer', 'deliverer')
      .leftJoinAndSelect('o.user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .addSelect('product.original_creator_contact')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .where('o.id = :orderId', { orderId })
      .getOne();

    if (!order) throw new NotFoundException('Order not found');

    const hasVendorItem = (order.items || []).some(
      (it) => (it.product as any)?.vendor?.id === vendorId,
    );
    if (!hasVendorItem)
      throw new ForbiddenException('You do not have access to this order');

    const d: any = (order as any).deliverer || null;
    const vendorItemsRaw = (order.items || []).filter(
      (it) => (it.product as any)?.vendor?.id === vendorId,
    );
    const vendorItems = vendorItemsRaw.map((it: any) => {
      const product: any = it.product || {};
      const images: any[] = Array.isArray(product.images) ? product.images : [];
      const firstImage = images[0] || {};
      const productImage =
        product.imageUrl || firstImage.thumbnailSrc || firstImage.src || null;
      const productCurrency = product?.currency || 'ETB';
      const { amount: priceConverted, rate } = this.convertPrice(
        it.price,
        productCurrency,
        targetCurrency,
      );
      // Convert vendorPayout (which is line total) to target currency
      const { amount: payoutConverted } = this.convertPrice(
        it.vendorPayout,
        productCurrency,
        targetCurrency,
      );

      const priceToUse = priceConverted ?? it.price;
      const payoutToUse = payoutConverted ?? it.vendorPayout;

      return {
        ...it,
        price: priceToUse,
        vendorPayout: payoutToUse,
        currency: targetCurrency,
        price_display: {
          amount: priceToUse ?? null,
          currency: targetCurrency,
          convertedFrom: productCurrency,
          rate,
        },
        product: {
          ...product,
          image: productImage,
          thumbnail: productImage,
          sku: product.sku ?? null,
        },
      };
    });
    const vendorItemCount = vendorItems.length;
    const vendorSubtotal = vendorItems.reduce((sum, it: any) => {
      const price =
        typeof it.price === 'number' ? it.price : Number(it.price || 0);
      const quantity =
        typeof it.quantity === 'number'
          ? it.quantity
          : Number(it.quantity || 0);
      return sum + price * quantity;
    }, 0);

    const vendorNetPayout = vendorItems.reduce((sum, it: any) => {
      const payout =
        typeof it.vendorPayout === 'number'
          ? it.vendorPayout
          : Number(it.vendorPayout || 0);
      return sum + payout;
    }, 0);

    const vendorSubtotalDisplay = {
      amount: Math.round(vendorSubtotal * 100) / 100,
      currency: targetCurrency,
      convertedFrom: (vendorItemsRaw[0]?.product as any)?.currency || 'ETB',
      rate: vendorItems[0]?.price_display?.rate,
    } as const;
    const statusCounts = vendorItems.reduce(
      (acc: Record<OrderStatus, number>, it: any) => {
        const s: OrderStatus | undefined = it.status;
        if (s) acc[s] = (acc[s] || 0) + 1;
        return acc;
      },
      {} as Record<OrderStatus, number>,
    );
    const statusSummary = {
      overallStatus: this.computeAggregateStatus(vendorItems as any),
      counts: statusCounts,
    };
    const customer: any = (order as any).user || {};
    const customerName =
      customer.displayName || customer.storeName || customer.email || null;
    const customerAvatar = customer.avatarUrl || null;
    const customerPhoneRaw = customer.phoneNumber || null;
    const customerPhone = customerPhoneRaw
      ? `${customer.phoneCountryCode || ''}${customerPhoneRaw}`.trim()
      : null;
    const shipping = (order as any).shippingAddress || {};
    const customerCity = shipping.city || null;
    const customerCountry = shipping.country || null;
    return {
      ...order,
      deliverer: d,
      delivererId: d?.id ?? null,
      delivererName: d?.displayName ?? null,
      delivererEmail: d?.email ?? null,
      delivererPhone: d?.phoneNumber ?? null,
      assignedDeliverer: d
        ? {
            id: d.id,
            name: d.displayName ?? null,
            email: d.email ?? null,
            phone: d?.phoneNumber ?? null,
          }
        : null,
      delivererSummary: d
        ? {
            id: d.id,
            name: d.displayName ?? null,
            email: d.email ?? null,
            phone: d?.phoneNumber ?? null,
          }
        : null,
      items: vendorItems,
      vendorItemCount,
      vendorSubtotal,
      vendorNetAmount: vendorNetPayout,
      statusSummary,
      isSingleVendorOrder:
        (order.items || []).length > 0 &&
        (order.items || []).every(
          (it) => (it.product as any)?.vendor?.id === vendorId,
        ),
      customerName,
      customerAvatar,
      customerPhone,
      customerContactAllowed: !!customerPhone,
      customerCity,
      customerCountry,
      currency: targetCurrency,
      vendorSubtotal_display: vendorSubtotalDisplay,
      total_display: vendorSubtotalDisplay,
    };
  }

  /**
   * Vendor assigns a deliverer to an order, only if all items belong to this vendor.
   * Sets order.status to SHIPPED and notifies the deliverer.
   */
  async assignDelivererByVendor(
    vendorId: number,
    orderId: number,
    delivererId: number,
  ) {
    const order = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('o.user', 'user')
      .where('o.id = :orderId', { orderId })
      .getOne();
    if (!order) throw new NotFoundException('Order not found');
    const items = order.items || [];
    // Relaxed check: Allow assignment if AT LEAST ONE item belongs to the vendor.
    // This supports multi-vendor orders where each vendor manages their own portion.
    const hasVendorItems =
      items.length > 0 &&
      items.some((it) => (it.product as any)?.vendor?.id === vendorId);

    if (!hasVendorItems) {
      throw new ForbiddenException(
        'Order does not contain any items from this vendor',
      );
    }

    // Validate deliverer role
    const deliverer = await this.userRepository.findOne({
      where: { id: delivererId },
    });
    if (!deliverer || !(deliverer.roles || []).includes(UserRole.DELIVERER)) {
      throw new ForbiddenException('Selected user is not a deliverer');
    }

    // Set deliverer and advance status to SHIPPED
    (order as any).deliverer = deliverer as any;
    order.status = OrderStatus.SHIPPED;
    // Set acceptance status to PENDING
    order.deliveryAcceptanceStatus = DeliveryAcceptanceStatus.PENDING;

    await this.orderRepository.save(order);
    await this.notifyOrderStatusChange(order, OrderStatus.SHIPPED);

    // Notify deliverer
    try {
      await this.notificationsService.createAndDispatch({
        userId: delivererId,
        title: 'New Delivery Request',
        body: `You have a new delivery request order #${orderId}. Please Accept or Reject.`,
        type: NotificationType.ORDER,
        data: {
          orderId: String(orderId),
          route: '/deliverer-deliveries',
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          action: 'request_acceptance',
        },
      });
    } catch {
      // ignore notification failures
    }

    // Return enriched payload with deliverer info and common aliases
    return {
      ...order,
      deliverer,
      delivererId: deliverer.id,
      delivererName: deliverer.displayName ?? null,
      delivererEmail: deliverer.email ?? null,
      delivererPhone: (deliverer as any)?.phoneNumber ?? null,
      assignedDeliverer: {
        id: deliverer.id,
        name: deliverer.displayName ?? null,
        email: deliverer.email ?? null,
        phone: (deliverer as any)?.phoneNumber ?? null,
      },
      // Add snake_case aliases for robust frontend parsing
      assigned_deliverer: {
        id: deliverer.id,
        name: deliverer.displayName ?? null,
        email: deliverer.email ?? null,
        phone: (deliverer as any)?.phoneNumber ?? null,
      },
      deliverer_id: deliverer.id,
      deliverer_name: deliverer.displayName ?? null,
      delivererSummary: {
        id: deliverer.id,
        name: deliverer.displayName ?? null,
        email: deliverer.email ?? null,
        phone: (deliverer as any)?.phoneNumber ?? null,
      },
    } as any;
  }

  /**
   * Allow a vendor to move an order through vendor-controlled states.
   * To avoid cross-vendor interference, we only permit updates when ALL items in the order
   * belong to this vendor (single-vendor order). Allowed transitions:
   *   PENDING -> PROCESSING -> SHIPPED
   */
  async updateOrderStatus(
    vendorId: number,
    orderId: number,
    status: OrderStatus,
  ) {
    const order = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('o.user', 'user')
      .where('o.id = :orderId', { orderId })
      .getOne();

    if (!order) throw new NotFoundException('Order not found');

    const items = order.items || [];
    const allFromVendor =
      items.length > 0 &&
      items.every((it) => (it.product as any)?.vendor?.id === vendorId);
    if (!allFromVendor) {
      throw new ForbiddenException(
        'Order contains items from other vendors; cannot update global status',
      );
    }

    const current = order.status;
    const allowedNext: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [
        OrderStatus.PROCESSING,
        OrderStatus.CANCELLED_BY_SELLER,
      ],
      [OrderStatus.PROCESSING]: [
        OrderStatus.SHIPPED,
        OrderStatus.CANCELLED_BY_SELLER,
      ],
      [OrderStatus.SHIPPED]: [],
      [OrderStatus.OUT_FOR_DELIVERY]: [],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.DELIVERY_FAILED]: [],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.CANCELLED_BY_BUYER]: [],
      [OrderStatus.CANCELLED_BY_SELLER]: [],
      [OrderStatus.DISPUTED]: [],
    };

    const canGo = allowedNext[current]?.includes(status);
    if (!canGo) {
      throw new ForbiddenException(
        `Invalid status transition from ${current} to ${status}`,
      );
    }

    // Payment gating: allow moving to SHIPPED only if PAID or COD
    if (
      status === OrderStatus.SHIPPED &&
      order.paymentStatus !== PaymentStatus.PAID &&
      order.paymentMethod !== PaymentMethod.COD
    ) {
      throw new ForbiddenException('Cannot ship unpaid order (non-COD)');
    }

    order.status = status;
    await this.orderRepository.save(order);
    await this.notifyOrderStatusChange(order, status);
    return order;
  }

  // ===== Item-level operations =====
  async getVendorOrderItems(vendorId: number, orderId: number) {
    const items = await this.orderItemRepository.find({
      where: {
        order: { id: orderId },
      } as any,
      relations: ['product', 'product.vendor', 'order'],
    });
    const ownItems = items.filter(
      (it) => (it.product as any)?.vendor?.id === vendorId,
    );
    if (items.length > 0 && ownItems.length === 0) {
      throw new ForbiddenException('You do not have access to this order');
    }
    return ownItems;
  }

  private computeAggregateStatus(items: OrderItem[]): OrderStatus {
    const statuses = new Set(items.map((i) => i.status));
    if (statuses.has(OrderStatus.DELIVERY_FAILED))
      return OrderStatus.DELIVERY_FAILED;
    if (
      items.length > 0 &&
      items.every((i) => i.status === OrderStatus.DELIVERED)
    )
      return OrderStatus.DELIVERED;
    if (statuses.has(OrderStatus.OUT_FOR_DELIVERY))
      return OrderStatus.OUT_FOR_DELIVERY;
    if (statuses.has(OrderStatus.SHIPPED)) return OrderStatus.SHIPPED;
    if (statuses.has(OrderStatus.PROCESSING)) return OrderStatus.PROCESSING;
    return OrderStatus.PENDING;
  }

  async updateOrderItemStatus(
    vendorId: number,
    orderId: number,
    itemId: number,
    next: OrderStatus,
  ) {
    const item = await this.orderItemRepository.findOne({
      where: { id: itemId, order: { id: orderId } } as any,
      relations: [
        'product',
        'product.vendor',
        'order',
        'order.items',
        'order.user',
      ],
    });
    if (!item) throw new NotFoundException('Order item not found');
    if ((item.product as any)?.vendor?.id !== vendorId) {
      throw new ForbiddenException('You cannot update this item');
    }

    const allowedNext: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [
        OrderStatus.PROCESSING,
        OrderStatus.CANCELLED_BY_SELLER,
      ],
      [OrderStatus.PROCESSING]: [
        OrderStatus.SHIPPED,
        OrderStatus.CANCELLED_BY_SELLER,
      ],
      [OrderStatus.SHIPPED]: [
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
      ],
      [OrderStatus.OUT_FOR_DELIVERY]: [
        OrderStatus.DELIVERED,
        OrderStatus.DELIVERY_FAILED,
      ],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.DELIVERY_FAILED]: [],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.CANCELLED_BY_BUYER]: [],
      [OrderStatus.CANCELLED_BY_SELLER]: [],
      [OrderStatus.DISPUTED]: [],
    };
    if (!allowedNext[item.status]?.includes(next)) {
      throw new ForbiddenException(
        `Invalid status transition from ${item.status} to ${next}`,
      );
    }

    // Payment gating: restrict shipping/delivery on unpaid (non-COD) orders
    const isShippingLike = [
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ].includes(next);
    if (
      isShippingLike &&
      item.order.paymentStatus !== PaymentStatus.PAID &&
      item.order.paymentMethod !== PaymentMethod.COD
    ) {
      throw new ForbiddenException(
        'Cannot progress to shipping/delivery on unpaid order (non-COD)',
      );
    }

    item.status = next;
    if (next === OrderStatus.SHIPPED) item.shippedAt = new Date();
    if (next === OrderStatus.DELIVERED) item.deliveredAt = new Date();
    await this.orderItemRepository.save(item);

    // Update aggregate order status based on all items
    const freshItems = await this.orderItemRepository.find({
      where: { order: { id: orderId } } as any,
    });
    const aggregate = this.computeAggregateStatus(freshItems);
    if (item.order.status !== aggregate) {
      item.order.status = aggregate;
      await this.orderRepository.save(item.order);
      await this.notifyOrderStatusChange(item.order, aggregate);
    }

    return item;
  }

  async updateOrderItemTracking(
    vendorId: number,
    orderId: number,
    itemId: number,
    tracking: {
      trackingCarrier?: string;
      trackingNumber?: string;
      trackingUrl?: string;
    },
  ) {
    const item = await this.orderItemRepository.findOne({
      where: { id: itemId, order: { id: orderId } } as any,
      relations: ['product', 'product.vendor'],
    });
    if (!item) throw new NotFoundException('Order item not found');
    if ((item.product as any)?.vendor?.id !== vendorId) {
      throw new ForbiddenException('You cannot update this item');
    }
    item.trackingCarrier =
      tracking.trackingCarrier ?? item.trackingCarrier ?? null;
    item.trackingNumber =
      tracking.trackingNumber ?? item.trackingNumber ?? null;
    item.trackingUrl = tracking.trackingUrl ?? item.trackingUrl ?? null;
    await this.orderItemRepository.save(item);
    return item;
  }

  async createShipment(
    vendorId: number,
    orderId: number,
    items: number[],
    tracking: {
      trackingCarrier?: string;
      trackingNumber?: string;
      trackingUrl?: string;
    },
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ForbiddenException('At least one item is required');
    }
    const rows = await this.orderItemRepository.find({
      where: items.map((id) => ({ id, order: { id: orderId } })) as any,
      relations: ['product', 'product.vendor', 'order', 'order.items'],
    });
    if (rows.length !== items.length) {
      throw new NotFoundException('One or more items were not found');
    }
    for (const it of rows) {
      if ((it.product as any)?.vendor?.id !== vendorId) {
        throw new ForbiddenException('You cannot update one or more items');
      }
    }
    const allowedFrom = new Set([OrderStatus.PENDING, OrderStatus.PROCESSING]);
    for (const it of rows) {
      if (!allowedFrom.has(it.status)) {
        throw new ForbiddenException(
          `Item ${it.id} cannot be shipped from status ${it.status}`,
        );
      }
    }
    // Payment gating: restrict shipping on unpaid (non-COD) orders
    const order = rows[0].order;
    if (
      order.paymentStatus !== PaymentStatus.PAID &&
      order.paymentMethod !== PaymentMethod.COD
    ) {
      throw new ForbiddenException(
        'Cannot ship items on unpaid order (non-COD)',
      );
    }

    const now = new Date();
    for (const it of rows) {
      it.status = OrderStatus.SHIPPED;
      it.shippedAt = now;
      it.trackingCarrier =
        tracking.trackingCarrier ?? it.trackingCarrier ?? null;
      it.trackingNumber = tracking.trackingNumber ?? it.trackingNumber ?? null;
      it.trackingUrl = tracking.trackingUrl ?? it.trackingUrl ?? null;
    }
    await this.orderItemRepository.save(rows);
    const freshItems = await this.orderItemRepository.find({
      where: { order: { id: orderId } } as any,
    });
    const aggregate = this.computeAggregateStatus(freshItems);
    if (order.status !== aggregate) {
      order.status = aggregate;
      await this.orderRepository.save(order);
    }
    return rows;
  }

  // Quick publish/unpublish for vendor
  async setPublishStatus(
    userId: number,
    productId: number,
    status: 'publish' | 'draft',
  ): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ['vendor'],
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.vendor.id !== userId)
      throw new ForbiddenException('You can only update your own products');
    product.status = status;
    await this.productRepository.save(product);
    // Return enriched version with relations for UI refresh
    const full = await this.productRepository.findOne({
      where: { id: productId },
      relations: ['images', 'category', 'tags', 'vendor'],
    });
    try {
      return normalizeProductMedia(full as any);
    } catch {
      return full as any;
    }
  }

  // --- Vendor Health Score ---
  // Metrics: DISPUTE rate vs total DELIVERED orders (last 30 days)
  // Logic: > 10% rate => flag for review
  async getVendorHealth(vendorId: number) {
    // 1. Define window (30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 2. Count "Total Completed" (Delivered + Disputed) for this vendor
    // We look at OrderItems to be specific to the vendor in case of mixed orders
    const completedItems = await this.orderItemRepository
      .createQueryBuilder('item')
      .leftJoin('item.product', 'product')
      .leftJoin('item.order', 'order')
      .where('product.vendorId = :vendorId', { vendorId })
      .andWhere('order.createdAt >= :thirtyDaysAgo', { thirtyDaysAgo })
      .andWhere('order.status IN (:...statuses)', {
        statuses: [OrderStatus.DELIVERED, OrderStatus.DISPUTED],
      })
      .getCount();

    // 3. Count "Disputed" items
    const disputedItems = await this.orderItemRepository
      .createQueryBuilder('item')
      .leftJoin('item.product', 'product')
      .leftJoin('item.order', 'order')
      .where('product.vendorId = :vendorId', { vendorId })
      .andWhere('order.createdAt >= :thirtyDaysAgo', { thirtyDaysAgo })
      .andWhere('order.status = :disputed', { disputed: OrderStatus.DISPUTED })
      .getCount();

    // 4. Calculate Rate
    const total = completedItems > 0 ? completedItems : 0;
    const disputeRate = total === 0 ? 0 : disputedItems / total;

    // 5. Check penalty threshold (10%)
    const penaltyThreshold = 0.1;
    let flaggedForReview = false;

    if (total >= 5 && disputeRate > penaltyThreshold) {
      // Minimum 5 orders to avoid noise
      flaggedForReview = true;
    }

    // 6. Update Vendor Flag
    const vendor = await this.userRepository.findOne({
      where: { id: vendorId },
    });
    if (vendor && vendor.flaggedForReview !== flaggedForReview) {
      vendor.flaggedForReview = flaggedForReview;
      await this.userRepository.save(vendor);

      if (flaggedForReview) {
        this.logger.warn(
          `Vendor ${vendorId} FLAGGED for review. Dispute Rate: ${(disputeRate * 100).toFixed(1)}%`,
        );
      }
    }

    return {
      vendorId,
      period: '30d',
      totalCompleted: total,
      disputedCount: disputedItems,
      disputeRate: Number(disputeRate.toFixed(4)),
      flaggedForReview,
    };
  }

  async generateLabel(
    vendorId: number,
    orderId: number,
    dto: GenerateLabelDto,
  ) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['user', 'items', 'items.product', 'items.product.vendor'],
    });
    if (!order) throw new NotFoundException('Order not found');

    // Verify vendor owns at least one item in this order
    const vendorItems = order.items.filter(
      (i) => i.product.vendor.id === vendorId,
    );
    if (vendorItems.length === 0) {
      throw new ForbiddenException('You do not have items in this order');
    }

    // Construct addresses (Mock logic for now, assuming vendor address is in profile)
    const vendor = await this.userRepository.findOne({
      where: { id: vendorId },
    });
    const senderAddress = {
      name: vendor?.displayName || 'Vendor',
      street: 'Vendor Address', // TODO: Add address to User entity
      city: 'Vendor City',
      country: 'Vendor Country',
    };

    const recipientAddress = {
      name: order.shippingAddress.fullName,
      street: order.shippingAddress.address,
      city: order.shippingAddress.city,
      country: order.shippingAddress.country,
      phone: order.shippingAddress.phoneNumber,
    };

    // Call Shipping Service
    return this.shippingService.generateLabel(
      dto.carrier,
      senderAddress,
      recipientAddress,
      {
        weight: dto.weight || 1,
        dimensions: dto.dimensions || '10x10x10',
      },
    );
  }
}
