/* eslint-disable @typescript-eslint/await-thenable */
/* eslint-disable no-empty, @typescript-eslint/no-unused-vars */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan, TreeRepository, IsNull, Not } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { Product } from './entities/product.entity';
import {
  User,
  VerificationStatus,
  SubscriptionTier,
} from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductImage } from './entities/product-image.entity';
import { ProductFilterDto } from './dto/ProductFilterDto';
import { TieredProductsDto } from './dto/tiered-products.dto';
import { Tag } from '../tags/tag.entity';
import { ProductImpression } from './entities/product-impression.entity';
import { SearchKeyword } from './entities/search-keyword.entity';
import { MediaCleanupTask } from '../media/entities/media-cleanup-task.entity';
import { createHash } from 'crypto';
import { normalizeProductMedia } from '../common/utils/media-url.util';
import { normalizeDigitalAttributes } from '../common/utils/digital.util';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { GeoResolverService } from '../common/services/geo-resolver.service';
import { UserRole } from '../auth/roles.enum';
// import { assertAllowedMediaUrl } from '../common/utils/media-policy.util';
import { DoSpacesService } from '../media/do-spaces.service';
import { AuditService } from '../audit/audit.service';
import { Review } from '../reviews/entities/review.entity';
import { FavoritesService } from '../favorites/favorites.service';
import { qbCacheIfEnabled } from '../common/utils/db-cache.util';
import { CurrencyService } from '../common/services/currency.service';
import { EmailService } from '../email/email.service';
import { BOOST_OPTIONS, BoostTier } from './boost-pricing.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly productImageRepo: Repository<ProductImage>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Tag) private readonly tagRepo: Repository<Tag>,
    @InjectRepository(Category)
    private readonly categoryRepo: TreeRepository<Category>,
    @InjectRepository(ProductImpression)
    private readonly impressionRepo: Repository<ProductImpression>,
    @InjectRepository(SearchKeyword)
    private readonly searchKeywordRepo: Repository<SearchKeyword>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(MediaCleanupTask)
    private readonly cleanupRepo: Repository<MediaCleanupTask>,
    private readonly doSpaces: DoSpacesService,
    private readonly audit: AuditService,
    private readonly geo: GeoResolverService,
    private readonly favorites: FavoritesService,
    private readonly currencyService: CurrencyService,
    private readonly emailService: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  // Simple in-memory cache for Property & Real Estate subtree ids
  private propertyIdsCache: { ids: number[]; at: number } | null = null;

  private readonly supportedCurrencies = ['ETB', 'SOS', 'KES', 'DJF', 'USD'];

  private normalizeCurrencyParam(value?: string | null): string {
    const upper = (value || '').trim().toUpperCase();
    return this.supportedCurrencies.includes(upper) ? upper : 'ETB';
  }

  private convertAmount(
    amount: number | null | undefined,
    fromCurrency: string,
    toCurrency: string,
  ): number | null {
    if (amount === null || amount === undefined) return null;
    try {
      return this.currencyService.convert(amount, fromCurrency, toCurrency);
    } catch {
      return amount;
    }
  }

  private applyCurrency(product: Product, targetCurrency: string): Product {
    if (!product) return product;
    const from = product.currency || 'ETB';
    const price = this.convertAmount(product.price, from, targetCurrency);
    const sale = this.convertAmount(
      product.sale_price as any,
      from,
      targetCurrency,
    );
    const rate = this.currencyService.getRate(from, targetCurrency);
    const roundedRate =
      typeof rate === 'number'
        ? Math.round(rate * 1_000_000) / 1_000_000
        : undefined;

    (product as any).price = price ?? product.price;
    (product as any).sale_price = sale ?? product.sale_price;
    (product as any).currency = targetCurrency;

    // Provide transparent conversion metadata without breaking existing clients
    (product as any).price_display = {
      amount: price ?? product.price ?? null,
      currency: targetCurrency,
      convertedFrom: from,
      rate: roundedRate,
    };

    if (sale !== null && sale !== undefined) {
      (product as any).sale_price_display = {
        amount: sale,
        currency: targetCurrency,
        convertedFrom: from,
        rate: roundedRate,
      };
    }

    return product;
  }

  private applyCurrencyList(
    items: Product[],
    targetCurrency: string,
  ): Product[] {
    if (!Array.isArray(items) || !items.length) return items || [];
    return items.map((p) => this.applyCurrency(p, targetCurrency));
  }

  private async getPropertySubtreeIds(): Promise<number[]> {
    const now = Date.now();
    if (
      this.propertyIdsCache &&
      now - this.propertyIdsCache.at < 5 * 60 * 1000
    ) {
      return this.propertyIdsCache.ids;
    }
    // Find categories whose slug looks like property/real-estate
    const roots = await this.categoryRepo
      .createQueryBuilder('c')
      .where('c.slug ILIKE :p1 OR c.slug ~* :p2', {
        p1: '%property%',
        p2: 'real[-_ ]?estate',
      })
      .getMany()
      .catch(() => []);

    const idSet = new Set<number>();
    for (const root of roots || []) {
      try {
        const descs = await this.categoryRepo.findDescendants(root);
        for (const d of descs) idSet.add(d.id);
      } catch {
        if (root?.id) idSet.add(root.id);
      }
    }
    const ids = Array.from(idSet);
    this.propertyIdsCache = { ids, at: now };
    return ids;
  }

  /** Fetch many products by ids (any order); supports grid view lean selection when opts.view === 'grid' */
  async findManyByIds(
    ids: number[],
    opts?: { view?: 'grid' | 'full' },
  ): Promise<Product[]> {
    const list = Array.from(
      new Set((ids || []).filter((n) => Number.isInteger(n) && n > 0)),
    );
    if (!list.length) return [] as any;
    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.id IN (:...ids)', { ids: list })
      .andWhere('product.status = :status', { status: 'publish' })
      .andWhere('product.isBlocked = false');

    if ((opts?.view || 'grid') === 'grid') {
      qb.select([
        'product.id',
        'product.name',
        'product.price',
        'product.currency',
        'product.imageUrl',
        'product.average_rating',
        'product.rating_count',
        'product.sales_count',
        'product.stock_quantity',
        'product.manage_stock',
        'product.sale_price',
        'product.moq',
        'product.viewCount',
        'product.featured',
        'product.featuredExpiresAt',
        'product.listingType',
        'product.bedrooms',
        'product.listingCity',
        'product.bathrooms',
        'product.sizeSqm',
        'product.furnished',
        'product.rentPeriod',
        'product.createdAt',
        'vendor.id',
        'vendor.displayName',
        'vendor.storeName',
        'vendor.verified',
        'vendor.verifiedAt',
        'vendor.subscriptionTier',
        'vendor.createdAt',
        'vendor.avatarUrl',
        'category.id',
        'category.slug',
      ]);
    } else {
      qb.leftJoinAndSelect('product.tags', 'tag').leftJoinAndSelect(
        'product.images',
        'images',
      );
    }

    // Cache this deterministic GET by ids for a short time when enabled
    qbCacheIfEnabled(
      qb as any,
      `products:many:${opts?.view || 'grid'}:${list.join(',')}`,
    );
    const results = await qb.getMany();
    // Reorder to match input ids
    const byId = new Map(results.map((p) => [p.id, p]));
    return list.map((id) => byId.get(id)).filter(Boolean);
  }

  private isPropertyCategory(category?: any): boolean {
    const slug = (category && (category.slug || category?.['slug'])) || '';
    return (
      typeof slug === 'string' && /(property|real[-_ ]?estate)/i.test(slug)
    );
  }

  private sanitizeAttributes(attrs: any): Record<string, any> | null {
    if (!attrs || typeof attrs !== 'object') return attrs ?? null;
    const out: Record<string, any> = { ...attrs };
    try {
      const v = out.videoUrl ?? out.videourl ?? out.video_url;
      if (typeof v === 'string' && v.trim().length) {
        // Basic safety: enforce http/https and a reasonable length
        const url = new URL(v.trim());
        if (!['http:', 'https:'].includes(url.protocol) || v.length > 2048) {
          delete out.videoUrl;
          delete out.videourl;
          delete out.video_url;
        } else {
          out.videoUrl = url.toString();
          delete out.videourl;
          delete out.video_url;
        }
      }
    } catch {
      delete out.videoUrl;
      delete out.videourl;
      delete out.video_url;
    }
    return out;
  }

  private normalizeImagesInput(
    rawImages?: Array<
      | string
      | {
          src?: string | null;
          thumbnailSrc?: string | null;
          lowResSrc?: string | null;
          // Accept common mobile/web aliases so images don’t get dropped
          url?: string | null;
          uri?: string | null;
          path?: string | null;
          imageUrl?: string | null;
          image_url?: string | null;
          image?: string | null;
          cover?: string | null;
          thumbnail?: string | null;
          thumbnailUrl?: string | null;
          thumbnail_url?: string | null;
          thumb?: string | null;
          thumbUrl?: string | null;
          thumb_url?: string | null;
          lowRes?: string | null;
          low_res?: string | null;
          lowres?: string | null;
          lowResUrl?: string | null;
          lowRes_url?: string | null;
          lowres_url?: string | null;
        }
    >,
    fallbackSrc?: string | null,
  ): Array<{ src: string; thumbnailSrc: string; lowResSrc: string }> {
    const deriveVariant = (
      url: string,
      kind: 'thumb' | 'lowres',
    ): string | null => {
      const replaced = url
        .replace(/\/(full_)/, `/${kind}_`)
        .replace(/\/(thumb_)/, `/${kind}_`)
        .replace(/\/(lowres_)/, `/${kind}_`);
      if (replaced !== url) return replaced;
      return null;
    };

    const pick = (img: any, keys: string[]): string | null => {
      for (const k of keys) {
        const v = img?.[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      return null;
    };

    const arr = Array.isArray(rawImages) ? rawImages : [];
    if ((!arr || arr.length === 0) && fallbackSrc) {
      return [fallbackSrc].filter(Boolean).map((src) => {
        const thumb = deriveVariant(src, 'thumb') || src;
        const low = deriveVariant(src, 'lowres') || src;
        return { src, thumbnailSrc: thumb, lowResSrc: low };
      });
    }

    return arr
      .map((img) =>
        typeof img === 'string'
          ? { src: img, thumbnailSrc: img, lowResSrc: img }
          : img,
      )
      .map((img) => {
        const src = pick(img, [
          'src',
          'url',
          'uri',
          'path',
          'imageUrl',
          'image_url',
          'image',
          'cover',
        ]);
        if (!src) return null;
        const thumb =
          pick(img, [
            'thumbnailSrc',
            'thumbnail',
            'thumbnailUrl',
            'thumbnail_url',
            'thumb',
            'thumbUrl',
            'thumb_url',
          ]) ||
          deriveVariant(src, 'thumb') ||
          src;
        const low =
          pick(img, [
            'lowResSrc',
            'lowRes',
            'low_res',
            'lowres',
            'lowResUrl',
            'lowRes_url',
            'lowres_url',
          ]) ||
          deriveVariant(src, 'lowres') ||
          src;
        return { src, thumbnailSrc: thumb, lowResSrc: low };
      })
      .filter(
        (
          img,
        ): img is { src: string; thumbnailSrc: string; lowResSrc: string } =>
          !!img,
      );
  }

  async countByVendor(vendorId: number): Promise<number> {
    return this.productRepo.count({
      where: { vendor: { id: vendorId } },
    });
  }

  // ✅ NEW create method
  async create(
    data: CreateProductDto & { vendorId: number },
  ): Promise<Product> {
    const {
      tags = [],
      images = [],
      vendorId,
      categoryId,
      listingType,
      bedrooms,
      listingCity,
      bathrooms,
      sizeSqm,
      furnished,
      rentPeriod,
      attributes,
      downloadKey,
      ...rest
    } = data;

    // Security: Prevent creating featured products directly
    delete (rest as any).featured;
    delete (rest as any).featuredExpiresAt;

    const legacyImage = (rest as any).imageUrl || (rest as any).image_url;
    const normalizedImages = this.normalizeImagesInput(images, legacyImage);

    const vendor = await this.userRepo.findOneBy({ id: vendorId });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    // Check certification status and product limit
    // "Certified" (Verified) vendors have unlimited; "Uncertified" (Unverified) are limited to 5.
    if (!vendor.verified) {
      const productCount = await this.productRepo.count({
        where: { vendor: { id: vendorId } },
      });
      if (productCount >= 5) {
        throw new ForbiddenException(
          'Uncertified vendors are limited to 5 products. Please verify your business to become Certified for unlimited listings.',
        );
      }
    }

    // Enforce phone number presence for vendors (admins are exempt)
    try {
      const rolesArr = Array.isArray(vendor.roles) ? vendor.roles : [];
      const isAdmin =
        rolesArr.includes('ADMIN' as any) ||
        rolesArr.includes('SUPER_ADMIN' as any);
      if (!isAdmin) {
        const phone =
          (vendor as any).phoneNumber ||
          (vendor as any).vendorPhoneNumber ||
          '';
        if (!phone || !String(phone).trim()) {
          throw new BadRequestException(
            'A phone number is required on your profile before posting a product. Please update your profile to continue.',
          );
        }
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
    }

    let category = undefined;
    if (categoryId) {
      category = await this.categoryRepo.findOneBy({ id: categoryId });
      if (!category) throw new NotFoundException('Category not found');
    }
    // Property validations
    if (category && this.isPropertyCategory(category)) {
      if (!listingCity || !String(listingCity).trim()) {
        throw new BadRequestException(
          'listingCity is required for Property & Real Estate listings',
        );
      }
      if (
        listingType === 'rent' &&
        (!rentPeriod || !String(rentPeriod).trim())
      ) {
        throw new BadRequestException(
          'rentPeriod is required when listing_type is rent',
        );
      }
    }

    // Image URL host policy check removed in rollback

    // Enforce verification for publishing
    const isVerified =
      vendor.verified === true ||
      vendor.verificationStatus === VerificationStatus.APPROVED;

    let status = rest.status;
    // If status is 'publish' (or undefined defaulting to publish) but not verified, force pending_approval
    if ((!status || status === 'publish') && !isVerified) {
      status = 'pending_approval';
    }

    const product = this.productRepo.create({
      ...rest,
      status,
      vendor,
      category,
      currency: rest.currency || vendor.currency || 'USD',
      listingType: listingType ?? null,
      bedrooms: bedrooms ?? null,
      listingCity: listingCity ?? null,
      bathrooms: bathrooms ?? null,
      sizeSqm: sizeSqm ?? null,
      furnished: furnished ?? null,
      rentPeriod: rentPeriod ?? null,
      attributes: this.sanitizeAttributes(attributes) ?? {},
      imageUrl: normalizedImages.length > 0 ? normalizedImages[0].src : null,
    });

    // If a downloadKey is provided explicitly, mirror it into attributes for digital products
    try {
      const attrs =
        product.attributes && typeof product.attributes === 'object'
          ? product.attributes
          : {};
      if (
        typeof downloadKey === 'string' &&
        downloadKey &&
        !attrs.downloadKey
      ) {
        attrs.downloadKey = downloadKey;
        product.attributes = attrs as any;
      }
    } catch {}

    if (tags.length) {
      product.tags = await this.assignTags(tags);
    }
    // 1. Save the main product first to get its ID
    const savedProduct = await this.productRepo.save(product);

    // 2. Create and save the associated ProductImage entities
    if (normalizedImages.length > 0) {
      const imageEntities = normalizedImages.map((imageObj, index) =>
        this.productImageRepo.create({
          src: imageObj.src,
          thumbnailSrc: imageObj.thumbnailSrc,
          lowResSrc: imageObj.lowResSrc,
          product: savedProduct, // Link to the saved product
          sortOrder: index,
        }),
      );
      await this.productImageRepo.save(imageEntities);
    }

    // 3. Return the product with all its relations
    return this.findOne(savedProduct.id);
  }

  async findOne(id: number, currency?: string): Promise<Product> {
    const targetCurrency = this.normalizeCurrencyParam(currency);
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor', 'category', 'tags', 'images'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    // Increment view counter in the background; ignore failures
    this.incrementViewCount(id).catch(() => {});
    try {
      const out: any = normalizeProductMedia(product);
      // Ensure digital alias fields are present for clients
      try {
        let attrs =
          out.attributes && typeof out.attributes === 'object'
            ? (out.attributes as Record<string, any>)
            : undefined;
        if (attrs) {
          // Normalize into canonical digital structure if applicable
          try {
            const { updated } = normalizeDigitalAttributes(attrs);
            if (updated && typeof updated === 'object') attrs = updated;
          } catch {}
          const dig =
            attrs.digital && typeof attrs.digital === 'object'
              ? attrs.digital
              : undefined;
          const dl =
            dig && typeof dig.download === 'object'
              ? (dig.download as Record<string, any>)
              : undefined;
          // Key resolution: prefer canonical key, else legacy, else derive from downloadUrl
          let key: string | undefined =
            (dl?.key as string) ||
            (attrs.downloadKey as string) ||
            out.downloadKey;
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
              key = this.doSpaces.urlToKeyIfInBucket(urlCandidate) || key;
            } catch {}
          }
          // downloadUrl
          let publicUrl: string | undefined =
            (dl?.publicUrl as string) ||
            (attrs.downloadUrl as string) ||
            (attrs as any).url ||
            (attrs as any).src;
          if (!publicUrl && typeof key === 'string' && key) {
            try {
              publicUrl = this.doSpaces.buildPublicUrl(key);
            } catch {}
          }
          if (!attrs.downloadUrl && publicUrl) attrs.downloadUrl = publicUrl;
          // Ensure root-level downloadKey alias for prefill
          if (
            !attrs.downloadKey &&
            typeof ((dl?.key as string) || key) === 'string' &&
            ((dl?.key as string) || key)
          ) {
            attrs.downloadKey = (dl?.key as string) || key;
          }
          // format
          if (!attrs.format) {
            const from =
              (dl?.key as string) ||
              key ||
              (typeof attrs.downloadUrl === 'string' ? attrs.downloadUrl : '');
            const ext = String(from.split('.').pop() || '').toLowerCase();
            if (ext === 'pdf' || ext === 'epub' || ext === 'zip')
              attrs.format = ext.toUpperCase();
          }
          // fileSizeMB
          if (
            !attrs.fileSizeMB &&
            typeof dl?.size === 'number' &&
            isFinite(dl.size)
          ) {
            const mb = dl.size / (1024 * 1024);
            if (mb > 0) attrs.fileSizeMB = Math.round(mb * 100) / 100;
          }
          // licenseRequired
          if (
            typeof attrs.licenseRequired === 'undefined' &&
            typeof dl?.licenseRequired === 'boolean'
          ) {
            attrs.licenseRequired = dl.licenseRequired;
          }

          // Expose a generic `file` alias object for clients that expect file/url shape
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
          if (
            typeof (attrs as any).files === 'undefined' &&
            (attrs as any).file
          ) {
            (attrs as any).files = [(attrs as any).file];
          }
          out.attributes = attrs;
        }
        // Log attribute keys (visibility in logs) for troubleshooting
        try {
          const a =
            out.attributes && typeof out.attributes === 'object'
              ? (out.attributes as Record<string, any>)
              : undefined;
          const dig =
            a && typeof a.digital === 'object' ? a.digital : undefined;
          const dl =
            dig && typeof dig.download === 'object' ? dig.download : undefined;
          const preview = {
            keys: a ? Object.keys(a) : [],
            hasDigital: !!dig,
            digitalKeys: dig ? Object.keys(dig) : [],
            hasDownload: !!dl,
            downloadKeys: dl ? Object.keys(dl) : [],
            downloadKey:
              (a as any)?.downloadKey || dl?.key || out.downloadKey || null,
            downloadUrl: (a as any)?.downloadUrl || dl?.publicUrl || null,
            format: (a as any)?.format || null,
            fileSizeMB: (a as any)?.fileSizeMB || null,
            licenseRequired: (a as any)?.licenseRequired ?? null,
          } as any;
          const debugPrefill =
            (process.env.DEBUG_PRODUCT_PREFILL || '').toLowerCase() === 'true';
          if (debugPrefill) {
            this.logger.log(
              `ProductsService.findOne prefill id=${id} attrs=${JSON.stringify(preview)}`,
            );
          }
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
                  .includes(id);
              if (should) {
                const raw = a ? JSON.stringify(a) : 'null';
                this.logger.warn(`DEBUG rawAttrs id=${id} attrs=${raw}`);
              }
            }
          } catch {}
        } catch {}
      } catch {}
      this.applyCurrency(out, targetCurrency);
      return out;
    } catch {
      return this.applyCurrency(product, targetCurrency);
    }
  }

  // Free digital download: presign attachment if product is marked free and has a downloadKey
  async getFreeDownload(
    productId: number,
    opts?: { ttl?: number; actorId?: number | null },
  ): Promise<{
    url: string;
    expiresIn: number;
    filename?: string;
    contentType?: string;
  }> {
    const product = await this.productRepo.findOne({
      where: {
        id: productId,
        status: 'publish' as any,
        isBlocked: false,
        deletedAt: IsNull(),
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    let attrs =
      product.attributes && typeof product.attributes === 'object'
        ? product.attributes
        : {};
    // Normalize to canonical digital structure if applicable
    try {
      const { updated } = normalizeDigitalAttributes(attrs);
      if (updated) attrs = updated as any;
    } catch {}
    const dig =
      attrs && typeof (attrs as any).digital === 'object'
        ? (attrs as any).digital
        : undefined;
    const dl =
      dig && typeof dig.download === 'object' ? dig.download : undefined;
    const isFree =
      dig?.isFree === true || attrs.isFree === true || attrs.is_free === true;
    // Resolve key: prefer canonical, else legacy, else derive from URL
    let downloadKey: string | undefined =
      (dl?.key as string) || (attrs.downloadKey as string) || undefined;
    if (!downloadKey) {
      const urlCandidate: string | undefined =
        typeof dl?.publicUrl === 'string' && dl.publicUrl
          ? dl.publicUrl
          : typeof attrs.downloadUrl === 'string' && attrs.downloadUrl
            ? attrs.downloadUrl
            : undefined;
      if (urlCandidate) {
        try {
          downloadKey =
            this.doSpaces.urlToKeyIfInBucket(urlCandidate) || undefined;
        } catch {}
      }
    }
    if (!isFree)
      throw new BadRequestException('This item is not marked as free');
    if (!downloadKey)
      throw new BadRequestException('No digital download available');

    // Basic rate-limit: 20 per day per product (unauth users will have null actorId)
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const count = await this.audit.countForTargetSince(
      'FREE_PRODUCT_DOWNLOAD',
      productId,
      from,
    );
    if (count >= 500) {
      // broader cap to protect origin for viral freebies
      throw new BadRequestException(
        'Download limit reached. Please try later.',
      );
    }

    const fileName = downloadKey.split('/').pop();
    const ext = (fileName?.split('.').pop() || '').toLowerCase();
    const contentType =
      ext === 'pdf'
        ? 'application/pdf'
        : ext === 'epub'
          ? 'application/epub+zip'
          : ext === 'zip'
            ? 'application/zip'
            : undefined;
    const ttlSecs = Math.max(60, Math.min(Number(opts?.ttl || 600), 3600));
    const url = await this.doSpaces.getDownloadSignedUrl(downloadKey, ttlSecs, {
      contentType,
      filename: fileName,
    });

    await this.audit.log({
      actorId: opts?.actorId ?? null,
      action: 'SIGNED_DOWNLOAD_FREE',
      targetType: 'FREE_PRODUCT_DOWNLOAD',
      targetId: productId,
      meta: { productId, downloadKey, ttlSecs },
    });
    return { url, expiresIn: ttlSecs, filename: fileName, contentType };
  }

  // Helper: get a presentable vendor name by id
  async getVendorDisplayName(vendorId: number): Promise<string | null> {
    try {
      const vendor = await this.userRepo.findOne({ where: { id: vendorId } });
      if (!vendor) return null;
      const name =
        (vendor as any).storeName ||
        (vendor as any).displayName ||
        (vendor as any).name ||
        '';
      return name ? String(name) : null;
    } catch {
      return null;
    }
  }

  // Find related products for a given product id. Strategy:
  // - Prefer same category subtree; then same vendor; then shared tags
  // - Exclude the base product
  // - Optional exact city match for property listings when provided

  /**
   * Generates a contextual feed starting with the focus product (full detail),
   * followed by simulated "Ads" (e.g., promoted/popular items),
   * followed by related products.
   *
   * Design:
   * Index 0: Focus Product (Detailed)
   * Index 1-2: Ad Products (Card View)
   * Index 3+: Related Products (Card View)
   */
  async getContextualFeed(id: number, currency?: string): Promise<any[]> {
    // 1. Fetch Focus Product (Detailed)
    // findOne handles view counting, normalization, etc.
    const focus = await this.findOne(id, currency);

    // 2. Fetch Ad Products (Random selection from popular)
    const targetCurrency = this.normalizeCurrencyParam(currency);
    const adsQb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'images')
      .where('product.status = :status', { status: 'publish' })
      .andWhere('product.isBlocked = false')
      .andWhere('product.id <> :pid', { pid: id })
      // Prioritize "Featured" (Paid/Sponsored) products first for monetization
      .orderBy('product.featured', 'DESC')
      // Then fallback to high viewCount as a proxy for popularity
      .addOrderBy('product.viewCount', 'DESC')
      .limit(20);

    // Lean select for Ads (same as related)
    adsQb.select([
      'product.id',
      'product.name',
      'product.price',
      'product.currency',
      'product.description',
      'product.status',
      'product.isBlocked',
      'product.featured',
      'product.featuredExpiresAt',
      'product.imageUrl',
      'product.average_rating',
      'product.rating_count',
      'product.sales_count',
      'product.createdAt',
      'product.listingType',
      'product.listingCity',
      'product.viewCount', // Needed for ad selection, though usually hidden
      'vendor.id',
      'vendor.roles',
      'vendor.storeName',
      'vendor.displayName',
      'vendor.email',
      'vendor.avatarUrl',
      'vendor.verified',
      'vendor.subscriptionTier',
      'vendor.createdAt',
      'vendor.verifiedAt',
      'category.id',
      'category.slug',
    ]);

    const adCandidates = await adsQb.getMany();

    // "System Ad" Implementation (Income Generating Logic):
    // 1. Separate Paid (Featured) from Free (High Traffic) candidates.
    // Respect expiration if set
    const now = new Date();
    const paidAds = adCandidates.filter(
      (p) =>
        p.featured &&
        (!p.featuredExpiresAt || new Date(p.featuredExpiresAt) > now),
    );
    const fillerAds = adCandidates.filter(
      (p) =>
        !p.featured ||
        (p.featuredExpiresAt && new Date(p.featuredExpiresAt) <= now),
    );

    // 2. Shuffle internally to rotate inventory, but strictly respect paid priority.
    // Paid ads always come before fillers.
    const sortedCandidates = [
      ...paidAds.sort(() => 0.5 - Math.random()),
      ...fillerAds.sort(() => 0.5 - Math.random()),
    ];

    // 3. Select top 2 slots for the feed
    const ads = sortedCandidates.slice(0, 2);

    const adsNormalized = await this.applyCurrencyList(
      ads.map((p) => normalizeProductMedia(p as any)) as any,
      targetCurrency,
    );

    // 3. Fetch Related Products
    const related = await this.findRelatedProducts(id, { limit: 12, currency });

    // 4. Combine into a unified feed
    // Clients can render 'focus' as the detailed view header, and others as grid items
    const rawFeed = [
      { ...focus, feedType: 'focus' },
      // Mark as 'system-ad' for client-side "Sponsored" badging
      ...adsNormalized.map((p) => ({ ...p, feedType: 'system-ad' })),
      ...related.map((p) => ({ ...p, feedType: 'related' })),
    ];

    // 5. Sanitize Nulls for Flutter clients
    // Ensure critical string fields are never null
    return rawFeed.map((item) => {
      const placeholder =
        'https://suuq-media.ams3.digitaloceanspaces.com/placeholder_1000.jpg';
      const safeImage = item.imageUrl || placeholder;

      // Defensive Vendor Sanitation (Partial Objects from Select)
      let safeVendor = item.vendor;
      if (safeVendor) {
        safeVendor = {
          ...safeVendor,
          roles: safeVendor.roles || ['VENDOR'],
          storeName: safeVendor.storeName || 'Suuq Vendor',
          displayName: safeVendor.displayName || 'Vendor',
          verified: !!safeVendor.verified,
        };
      }

      // Defensive Category Sanitation
      let safeCategory = item.category;
      if (safeCategory) {
        safeCategory = {
          ...safeCategory,
          name: safeCategory.name || 'Category',
          slug: safeCategory.slug || 'category',
        };
      } else {
        safeCategory = {
          id: 0,
          name: 'Uncategorized',
          slug: 'uncategorized',
        };
      }

      return {
        ...item, // Spread original properties
        name: item.name || 'Untitled',
        description: item.description || '',
        imageUrl: safeImage,
        image: safeImage, // Alias for Flutter compatibility
        status: item.status || 'publish',
        feedType: String(item.feedType || 'related'), // Ensure string
        vendor: safeVendor,
        category: safeCategory,
      };
    });
  }

  // - Return lean normalized media for client usage
  async findRelatedProducts(
    productId: number,
    opts?: { limit?: number; city?: string | null; currency?: string | null },
  ): Promise<any[]> {
    const targetCurrency = this.normalizeCurrencyParam(opts?.currency);
    const base = await this.productRepo.findOne({
      where: { id: productId },
      relations: ['category', 'vendor', 'tags'],
    });
    if (!base) throw new NotFoundException('Product not found');
    const lim = Math.min(Math.max(Number(opts?.limit) || 24, 1), 50);
    const city = (opts?.city || '').trim();

    // Resolve descendant category ids for stronger topical similarity
    let subtreeIds: number[] = [];
    if (base.category?.id) {
      try {
        const desc = await this.categoryRepo.findDescendants(base.category);
        subtreeIds = Array.from(new Set(desc.map((c) => c.id)));
      } catch {
        subtreeIds = [base.category.id];
      }
    }

    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.status = :status', { status: 'publish' })
      .andWhere('product.isBlocked = false')
      .andWhere('product.id <> :pid', { pid: productId })
      .limit(lim);

    // Prefer category subtree
    if (subtreeIds.length) {
      qb.andWhere('category.id IN (:...catIds)', { catIds: subtreeIds });
    }

    // Optional exact property city filter
    if (city) {
      qb.andWhere('LOWER(product.listing_city) = LOWER(:lc)', { lc: city });
    }

    // Soft scoring: prefer same vendor; then sales/rating recency
    if (base.vendor?.id) {
      qb.addOrderBy(
        `CASE WHEN vendor.id = :bv THEN 2 ELSE 0 END`,
        'DESC',
      ).setParameter('bv', base.vendor.id);
    }
    // Shared tags count approximation could be added here if needed
    qb.addOrderBy('product.sales_count', 'DESC', 'NULLS LAST');
    qb.addOrderBy('product.average_rating', 'DESC', 'NULLS LAST');
    qb.addOrderBy('product.createdAt', 'DESC');

    // Lean select
    qb.select([
      'product.id',
      'product.name',
      'product.price',
      'product.currency',
      'product.description',
      'product.status',
      'product.isBlocked',
      'product.featured',
      'product.imageUrl',
      'product.average_rating',
      'product.rating_count',
      'product.sales_count',
      'product.createdAt',
      'product.listingType',
      'product.listingCity',
      'vendor.id',
      'vendor.roles',
      'vendor.storeName',
      'vendor.displayName',
      'vendor.email',
      'vendor.avatarUrl',
      'vendor.verified',
      'vendor.subscriptionTier',
      'vendor.createdAt',
      'vendor.verifiedAt',
      'category.id',
      'category.slug',
    ]);

    const rows = await qb.getMany();
    // Normalize media fields for client compatibility and convert pricing
    return this.applyCurrencyList(
      rows.map((p) => normalizeProductMedia(p as any)) as any,
      targetCurrency,
    );
  }

  async incrementViewCount(id: number): Promise<void> {
    await this.productRepo
      .createQueryBuilder()
      .update(Product)
      .set({ viewCount: () => 'COALESCE(view_count, 0) + 1' as any })
      .where('id = :id', { id })
      .execute();
  }

  deriveImpressionSessionKey(
    ip: string,
    ua: string,
    sessionId?: string,
  ): string {
    const base = `${ip || ''}|${ua || ''}|${sessionId || ''}`;
    return createHash('sha256').update(base).digest('hex').slice(0, 64);
  }

  private normalizeQuery(q: string): string {
    return (q || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 256);
  }

  // Upsert a search keyword metric row; kind can be 'suggest' or 'submit'
  async recordSearchKeyword(
    q: string,
    kind: 'suggest' | 'submit',
    meta?: {
      ip?: string;
      ua?: string;
      results?: number;
      city?: string;
      vendorName?: string;
      country?: string;
      vendorHits?: Array<{
        name: string;
        id?: number;
        country?: string;
        count: number;
      }>;
    },
  ): Promise<void> {
    const qNorm = this.normalizeQuery(q);
    if (!qNorm || qNorm.length < 2) return;
    try {
      // Normalize geo
      const normCity = (meta?.city || '').toString().trim();
      const city = normCity ? normCity : null;
      // Country priority: explicit meta.country (2-letter) -> derive from city via GeoResolver
      const explicitCountry = (meta?.country || '').toString().trim();
      let country: string | null = null;
      if (explicitCountry && /^[a-zA-Z]{2}$/.test(explicitCountry)) {
        country = explicitCountry.toUpperCase();
      } else if (city) {
        const cc = this.geo?.resolveCountryFromCity(city) || null;
        // Ensure strictly 2-char code to satisfy varchar(2) constraint
        country = cc && cc.length === 2 ? cc.toUpperCase() : null;
      }
      // Normalize vendorHits array: ensure each item has proper country code normalization
      let vendorHitsJson: string | null = null;
      if (meta?.vendorHits && Array.isArray(meta.vendorHits)) {
        const cleaned = meta.vendorHits
          .filter((v) => v && typeof v === 'object' && v.name)
          .map((v) => {
            const name = (v.name || '').toString();
            const id =
              v.id != null && !Number.isNaN(Number(v.id))
                ? Number(v.id)
                : undefined;
            let vc: string | undefined;
            const raw = (v.country || '').toString().trim();
            if (raw && /^[a-zA-Z]{2}$/.test(raw)) vc = raw.toUpperCase();
            else if (city) {
              const cc = this.geo?.resolveCountryFromCity(city) || null;
              if (cc && cc.length === 2) vc = cc.toUpperCase();
            }
            return {
              name,
              ...(id != null ? { id } : {}),
              ...(vc ? { country: vc } : {}),
              count: Number(v.count) || 0,
            };
          });
        vendorHitsJson = cleaned.length ? JSON.stringify(cleaned) : null;
      }
      const zeroResults =
        typeof meta?.results === 'number' && meta.results <= 0;
      const zeroCity = zeroResults ? city : null;
      const zeroCountry = zeroResults ? country : null;
      const params = {
        q: q.slice(0, 256),
        qNorm,
        lastResults: meta?.results ?? null,
        lastIp: meta?.ip ? meta.ip.slice(0, 64) : null,
        lastUa: meta?.ua ? meta.ua.slice(0, 256) : null,
        lastCity: city ? city.slice(0, 128) : null,
        lastVendorName: meta?.vendorName ? meta.vendorName.slice(0, 256) : null,
        lastCountry: country,
        vendorHits: vendorHitsJson,
        isSuggest: kind === 'suggest' ? 1 : 0,
        isSubmit: kind === 'submit' ? 1 : 0,
        zeroCount: zeroResults ? 1 : 0,
        zeroAt: zeroResults ? new Date() : null,
        zeroCity: zeroCity ? zeroCity.slice(0, 128) : null,
        zeroCountry: zeroCountry ? zeroCountry.toUpperCase() : null,
      } as const;

      // Use INSERT ... ON CONFLICT for atomic counters. vendor_hits JSON passed as text → cast to jsonb.
      await this.searchKeywordRepo.query(
        `INSERT INTO search_keyword (
            q, q_norm, total_count, suggest_count, submit_count, last_results,
            last_ip, last_ua, last_city, last_vendor_name, last_country, vendor_hits,
            zero_results_count, last_zero_results_at, last_zero_results_city, last_zero_results_country
          ) VALUES (
            $1, $2, 1, $3, $4, $5,
            $6, $7, $8, $9, $10, $11::jsonb,
            $12, $13, $14, $15
          )
          ON CONFLICT (q_norm)
          DO UPDATE SET
            total_count = search_keyword.total_count + 1,
            suggest_count = search_keyword.suggest_count + EXCLUDED.suggest_count,
            submit_count = search_keyword.submit_count + EXCLUDED.submit_count,
            last_results = EXCLUDED.last_results,
            last_ip = COALESCE(EXCLUDED.last_ip, search_keyword.last_ip),
            last_ua = COALESCE(EXCLUDED.last_ua, search_keyword.last_ua),
            last_city = COALESCE(EXCLUDED.last_city, search_keyword.last_city),
            last_vendor_name = COALESCE(EXCLUDED.last_vendor_name, search_keyword.last_vendor_name),
            last_country = COALESCE(EXCLUDED.last_country, search_keyword.last_country),
            vendor_hits = COALESCE(EXCLUDED.vendor_hits, search_keyword.vendor_hits),
            last_seen_at = now(),
            zero_results_count = search_keyword.zero_results_count + EXCLUDED.zero_results_count,
            last_zero_results_at = CASE WHEN EXCLUDED.zero_results_count > 0 THEN now() ELSE search_keyword.last_zero_results_at END,
            last_zero_results_city = CASE WHEN EXCLUDED.zero_results_count > 0 THEN EXCLUDED.last_zero_results_city ELSE search_keyword.last_zero_results_city END,
            last_zero_results_country = CASE WHEN EXCLUDED.zero_results_count > 0 THEN EXCLUDED.last_zero_results_country ELSE search_keyword.last_zero_results_country END;
        `,
        [
          params.q,
          params.qNorm,
          // treat counts
          params.isSuggest,
          params.isSubmit,
          params.lastResults,
          params.lastIp,
          params.lastUa,
          params.lastCity,
          params.lastVendorName,
          params.lastCountry,
          params.vendorHits,
          params.zeroCount,
          params.zeroAt,
          params.zeroCity,
          params.zeroCountry,
        ],
      );
    } catch (e) {
      this.logger.warn(`recordSearchKeyword failed: ${e?.message || e}`);
    }
  }

  // Idempotent within a rolling window: if an impression exists for (productId, sessionKey) within window, skip increment
  async recordImpressions(
    productIds: number[],
    sessionKey: string,
    windowSeconds = 300,
    meta?: { ip?: string; country?: string; city?: string; userId?: number },
  ): Promise<{ recorded: number; ignored: number }> {
    const cutoff = new Date(Date.now() - windowSeconds * 1000);
    // Deduplicate, keep positive ints, and cap batch to guard the table
    const MAX_BATCH = 200;
    const cleanIds = Array.from(
      new Set(
        (productIds || [])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ).slice(0, MAX_BATCH);

    if (!cleanIds.length) return { recorded: 0, ignored: 0 };

    // Only consider products that are actually visible
    const visibleIds = await this.productRepo
      .createQueryBuilder('product')
      .select('product.id', 'id')
      .where('product.id IN (:...ids)', { ids: cleanIds })
      .andWhere('product.status = :status', { status: 'publish' })
      .andWhere('product.isBlocked = false')
      .andWhere('product.deleted_at IS NULL')
      .getRawMany()
      .then((rows) => rows.map((r) => Number(r.id)))
      .catch(() => []);

    if (!visibleIds.length) return { recorded: 0, ignored: cleanIds.length };

    let recorded = 0;
    let ignored = 0;
    // Fetch existing recent impressions for these products and session
    const existing = await this.impressionRepo.find({
      where: {
        sessionKey,
        productId: In(visibleIds),
        createdAt: MoreThan(cutoff),
      } as any,
    });
    const existingSet = new Set(existing.map((e) => e.productId));
    const toInsert = visibleIds.filter((id) => !existingSet.has(id));
    if (toInsert.length) {
      let country = meta?.country;
      const city = meta?.city;
      if (!country && city) {
        country = this.geo.resolveCountryFromCity(city) || undefined;
      }

      const rows = toInsert.map((productId) =>
        this.impressionRepo.create({
          productId,
          sessionKey,
          ipAddress: meta?.ip,
          country,
          city,
          userId: meta?.userId,
        }),
      );
      await this.impressionRepo.save(rows);
      // Bulk increment view_count for new ones
      await this.productRepo
        .createQueryBuilder()
        .update(Product)
        .set({ viewCount: () => 'COALESCE(view_count, 0) + 1' as any })
        .where('id IN (:...ids)', { ids: toInsert })
        .execute();
      recorded = toInsert.length;
    }
    ignored = cleanIds.length - recorded;
    return { recorded, ignored };
  }

  /**
   * Fetch active featured (system-ad) products.
   * Respects featuredExpiresAt > NOW.
   */
  async findFeaturedActive(
    limit: number,
    opts?: { currency?: string },
  ): Promise<Product[]> {
    const now = new Date();
    const products = await this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.featured = :featured', { featured: true })
      .andWhere(
        '(product.featuredExpiresAt IS NULL OR product.featuredExpiresAt > :now)',
        { now },
      )
      .andWhere('product.status = :status', { status: 'publish' })
      .andWhere('product.isBlocked = :blocked', { blocked: false })
      .orderBy('product.id', 'DESC')
      .take(limit)
      .getMany();

    if (opts?.currency) {
      return this.applyCurrencyList(products, opts.currency);
    }
    return products;
  }

  async findFiltered(filters: ProductFilterDto): Promise<{
    items: Product[];
    total: number;
    perPage: number;
    currentPage: number;
    totalPages: number;
  }> {
    const targetCurrency = this.normalizeCurrencyParam(
      (filters as any).currency,
    );
    const {
      page = 1,
      perPage: rawPerPage = 20,
      search,
      categoryId: rawCategoryId,
      categoryAlias,
      categoriesCsv,
      categorySlug,
      featured,
      tags,
      priceMin,
      priceMax,
      sort,
      country,
      region,
      city,
      geoPriority,
      userCountry,
      userRegion,
      userCity,
      view,
      vendorId,
      includeDescendants,
      categoryFirst,
      geoAppend,
      listing_type,
      listingType,
      bedrooms,
      bedrooms_min,
      bedrooms_max,
      bedroomsMin,
      bedroomsMax,
      lat,
      lng,
      distanceKm: maxDistanceKm,
      radiusKm,
    } = filters as any;
    // categoryId can be an array (DTO transforms comma-separated query into number[])
    const categoryIds: number[] = Array.isArray(rawCategoryId)
      ? (rawCategoryId as unknown as number[])
      : Array.isArray(categoryAlias)
        ? (categoryAlias as unknown as number[])
        : Array.isArray(categoriesCsv)
          ? (categoriesCsv as unknown as number[])
          : typeof rawCategoryId === 'number'
            ? [rawCategoryId]
            : typeof categoryAlias === 'number'
              ? [categoryAlias]
              : typeof categoriesCsv === 'number'
                ? [categoriesCsv]
                : [];

    // Clamp perPage to protect backend (aligned with DTO cap 100)
    const perPage = Math.min(Math.max(Number(rawPerPage) || 20, 1), 100);

    const listingTypeMode =
      (filters as any).listingTypeMode || (filters as any).listing_type_mode;
    const rawLt = listing_type ?? listingType;
    const ltNorm =
      typeof rawLt === 'string' ? rawLt.trim().toLowerCase() : undefined;
    const ltValid =
      ltNorm && (ltNorm === 'sale' || ltNorm === 'rent') ? ltNorm : undefined;

    // Geo helpers computed once to keep the logic consistent across branches
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
    const radius = Number.isFinite(Number(radiusKm))
      ? Math.max(0, Number(radiusKm))
      : Number.isFinite(Number(maxDistanceKm))
        ? Math.max(0, Number(maxDistanceKm))
        : undefined;
    const eastAfricaList = (filters as any).eastAfrica
      ? String((filters as any).eastAfrica)
          .split(',')
          .map((c: string) => c.trim().toUpperCase())
      : ['ET', 'SO', 'KE', 'DJ'];
    const propertySubtreeIds = await this.getPropertySubtreeIds().catch(
      () => [],
    );
    const hasPropCats =
      Array.isArray(propertySubtreeIds) && propertySubtreeIds.length > 0
        ? 1
        : 0;

    const applyFilters = (
      qb: any,
      opts: { categoryMode: 'none' | 'in' | 'not-in'; catIds?: number[] },
    ) => {
      if (view === 'grid') {
        qb.select([
          'product.id',
          'product.name',
          'product.price',
          'product.sale_price',
          'product.currency',
          'product.imageUrl',
          'product.average_rating',
          'product.rating_count',
          'product.sales_count',
          'product.viewCount',
          'product.featured',
          'product.featuredExpiresAt',
          'product.productType',
          'product.listingType',
          'product.bedrooms',
          'product.listingCity',
          'product.bathrooms',
          'product.sizeSqm',
          'product.furnished',
          'product.rentPeriod',
          'product.createdAt',
          'product.moq',
          'product.dispatchDays',
          'vendor.id',
          'vendor.email',
          'vendor.displayName',
          'vendor.avatarUrl',
          'vendor.storeName',
          'vendor.createdAt',
          'vendor.registrationCountry',
          'vendor.verified',
          'vendor.subscriptionTier',
          'category.id',
          'category.slug',
        ]);
        // include images relation for grid so the card util can pick a valid image
        // Optimize: use a subquery to fetch only the first image per product
        qb.leftJoinAndMapMany(
          'product.images',
          (subQuery) => {
            return subQuery
              .select('pi.id', 'id')
              .addSelect('pi.src', 'src')
              .addSelect('pi.thumbnailSrc', 'thumbnailSrc')
              .addSelect('pi.lowResSrc', 'lowResSrc')
              .addSelect('pi.productId', 'productId')
              .from(ProductImage, 'pi')
              .distinctOn(['pi.productId'])
              .orderBy('pi.productId')
              .addOrderBy('pi.sortOrder', 'ASC')
              .addOrderBy('pi.id', 'ASC');
          },
          'images',
          'images."productId" = product.id',
        );
      } else {
        qb.leftJoinAndSelect('product.tags', 'tag').leftJoinAndSelect(
          'product.images',
          'images',
        );
      }

      qb.andWhere('product.status = :status', { status: 'publish' })
        .andWhere('product.isBlocked = false')
        .andWhere('product.deleted_at IS NULL');

      if (search)
        qb.andWhere('product.name ILIKE :search', { search: `%${search}%` });

      if (opts.categoryMode === 'in' && opts.catIds?.length)
        qb.andWhere('category.id IN (:...catIds)', { catIds: opts.catIds });
      else if (opts.categoryMode === 'not-in' && opts.catIds?.length)
        qb.andWhere('category.id NOT IN (:...catIds)', {
          catIds: opts.catIds,
        });
      else if (categorySlug)
        qb.andWhere('category.slug = :categorySlug', { categorySlug });
      else if (categoryIds.length && !includeDescendants && !categoryFirst)
        qb.andWhere('category.id IN (:...categoryIds)', { categoryIds });

      if (vendorId) qb.andWhere('vendor.id = :vendorId', { vendorId });
      if (typeof featured === 'boolean') {
        if (featured) {
          qb.andWhere('product.featured = :featured', {
            featured: true,
          }).andWhere(
            '(product.featuredExpiresAt IS NULL OR product.featuredExpiresAt > NOW())',
          );
        } else {
          qb.andWhere('product.featured = :featured', { featured: false });
        }
      }
      if (tags) {
        const tagList = Array.isArray(tags)
          ? (tags as string[]).map((t) => String(t).trim())
          : String(tags)
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
        qb.innerJoin(
          'product.tags',
          'tagFilter',
          'tagFilter.name IN (:...tagList)',
          {
            tagList,
          },
        );
      }
      if (priceMin !== undefined)
        qb.andWhere('product.price >= :priceMin', { priceMin });
      if (priceMax !== undefined)
        qb.andWhere('product.price <= :priceMax', { priceMax });

      if (ltValid) {
        if (listingTypeMode === 'priority') {
          qb.addSelect(
            `CASE WHEN product.listing_type = :lt THEN 1 ELSE 0 END`,
            'lt_priority_rank',
          );
          qb.setParameter('lt', ltValid);
          qb.addOrderBy('lt_priority_rank', 'DESC');
        } else {
          qb.andWhere('product.listing_type = :lt', { lt: ltValid });
          this.logger.debug(`Applied listingType filter: ${ltValid}`);
        }
      }

      const brExact = bedrooms;
      const brMin = bedrooms_min ?? bedroomsMin;
      const brMax = bedrooms_max ?? bedroomsMax;
      if (brExact !== undefined)
        qb.andWhere('product.bedrooms = :br', { br: brExact });
      if (brMin !== undefined)
        qb.andWhere('product.bedrooms >= :brMin', { brMin });
      if (brMax !== undefined)
        qb.andWhere('product.bedrooms <= :brMax', { brMax });

      const listingCityFilter = (filters as any).listing_city;
      if (listingCityFilter) {
        qb.andWhere('LOWER(product.listing_city) = LOWER(:lc)', {
          lc: listingCityFilter,
        });
      } else if (userCity && ltValid) {
        qb.andWhere('LOWER(product.listing_city) = LOWER(:userLC)', {
          userLC: userCity,
        });
      }

      const baths = (filters as any).bathrooms;
      const bathsMin = (filters as any).bathrooms_min;
      const bathsMax = (filters as any).bathrooms_max;
      if (baths !== undefined)
        qb.andWhere('product.bathrooms = :baths', { baths });
      if (bathsMin !== undefined)
        qb.andWhere('product.bathrooms >= :bathsMin', { bathsMin });
      if (bathsMax !== undefined)
        qb.andWhere('product.bathrooms <= :bathsMax', { bathsMax });

      if (hasCoords) {
        const dExpr = `CASE WHEN vendor."locationLat" IS NULL OR vendor."locationLng" IS NULL THEN NULL ELSE (
          2 * 6371 * ASIN(
            SQRT(
              POWER(SIN(RADIANS((vendor."locationLat" - :lat) / 2)), 2) +
              COS(RADIANS(:lat)) * COS(RADIANS(vendor."locationLat")) *
              POWER(SIN(RADIANS((vendor."locationLng" - :lng) / 2)), 2)
            )
          )
        ) END`;
        qb.addSelect(dExpr, 'distance_km').setParameters({
          lat: latNum,
          lng: lngNum,
        });
        if (typeof radius === 'number' && isFinite(radius) && radius > 0) {
          qb.andWhere(`(${dExpr}) <= :radiusKm`, {
            lat: latNum,
            lng: lngNum,
            radiusKm: radius,
          });
        }
      }

      let addedGeoRank = false;
      if (geoPriority) {
        const uc = userCountry || country || '';
        const ur = userRegion || region || '';
        const uci = userCity || city || '';
        const eastAfricaSqlList = eastAfricaList
          .map((_, i) => `:ea${i}`)
          .join(',');
        const geoRankExpr = `CASE 
          WHEN (:uci <> '' AND LOWER(product."listing_city") = LOWER(:uci) AND :hasProp = 1 AND category.id IN (:...propIds)) THEN 5
          WHEN (:uci <> '' AND LOWER(vendor."registrationCity") = LOWER(:uci)) THEN 4
          WHEN (:ur <> '' AND LOWER(vendor."registrationRegion") = LOWER(:ur)) THEN 3
          WHEN (:uc <> '' AND LOWER(vendor."registrationCountry") = LOWER(:uc)) THEN 2
          WHEN UPPER(COALESCE(vendor."registrationCountry", '')) IN (${eastAfricaSqlList}) THEN 1
          ELSE 0 END`;
        qb.addSelect(geoRankExpr, 'geo_rank').setParameters({
          uci,
          ur,
          uc,
          hasProp: hasPropCats,
          propIds: hasPropCats ? propertySubtreeIds : [0],
          ...Object.fromEntries(eastAfricaList.map((v, i) => [`ea${i}`, v])),
        });
        addedGeoRank = true;
      } else {
        if (country)
          qb.andWhere('LOWER(vendor.registrationCountry) = LOWER(:country)', {
            country,
          });
        if (region)
          qb.andWhere('LOWER(vendor.registrationRegion) = LOWER(:region)', {
            region,
          });
        if (city)
          qb.andWhere('LOWER(vendor.registrationCity) = LOWER(:city)', {
            city,
          });
      }

      return { qb, addedGeoRank } as { qb: any; addedGeoRank: boolean };
    };

    const applySorting = (qb: any, addedGeoRank: boolean) => {
      if (sort === 'best_match') {
        // Priority for Certified vendors
        qb.orderBy('vendor.verified', 'DESC');

        if (addedGeoRank) qb.addOrderBy('geo_rank', 'DESC');
        qb.addOrderBy('product.sales_count', 'DESC', 'NULLS LAST')
          .addOrderBy('product.average_rating', 'DESC', 'NULLS LAST')
          .addOrderBy('product.rating_count', 'DESC', 'NULLS LAST')
          .addOrderBy('product.createdAt', 'DESC');
      } else if (
        (sort === 'distance_asc' || sort === 'distance_desc') &&
        hasCoords
      ) {
        if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
        qb.addOrderBy(
          'distance_km',
          sort === 'distance_desc' ? 'DESC' : 'ASC',
          'NULLS LAST',
        );
        qb.addOrderBy('product.createdAt', 'DESC');
      } else if (!sort || sort === 'created_desc' || sort === '') {
        // Priority for Certified vendors (default view) - Certified (true) before Uncertified
        qb.orderBy('vendor.verified', 'DESC');

        if (addedGeoRank) {
          qb.addOrderBy('geo_rank', 'DESC');
          qb.addOrderBy('product.sales_count', 'DESC', 'NULLS LAST')
            .addOrderBy('product.average_rating', 'DESC', 'NULLS LAST')
            .addOrderBy('product.createdAt', 'DESC');
        } else {
          qb.addOrderBy('product.createdAt', 'DESC');
        }
      } else if (sort === 'price_asc') {
        if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
        qb.addOrderBy('product.price', 'ASC', 'NULLS LAST');
      } else if (sort === 'price_desc') {
        if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
        qb.addOrderBy('product.price', 'DESC', 'NULLS LAST');
      } else if (sort === 'rating_desc') {
        if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
        qb.addOrderBy('product.average_rating', 'DESC', 'NULLS LAST')
          .addOrderBy('product.rating_count', 'DESC', 'NULLS LAST')
          .addOrderBy('product.createdAt', 'DESC');
      } else if (sort === 'sales_desc') {
        if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
        qb.addOrderBy('product.sales_count', 'DESC', 'NULLS LAST').addOrderBy(
          'product.createdAt',
          'DESC',
        );
      } else if (sort === 'views_desc') {
        if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
        qb.addOrderBy('product.viewCount', 'DESC', 'NULLS LAST').addOrderBy(
          'product.createdAt',
          'DESC',
        );
      } else {
        if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
        qb.addOrderBy('product.createdAt', 'DESC');
      }
    };

    // Resolve descendant category ids once and reuse
    let subtreeIds: number[] | null = null;
    if (
      (includeDescendants || categoryFirst) &&
      ((categoryIds && categoryIds.length) || categorySlug)
    ) {
      const baseIds: number[] = [];
      if (categoryIds && categoryIds.length) baseIds.push(...categoryIds);
      else if (categorySlug) {
        const found = await this.categoryRepo.findOne({
          where: { slug: categorySlug },
        });
        if (found?.id) baseIds.push(found.id);
      }
      if (baseIds.length) {
        const idSet = new Set<number>();
        for (const bid of baseIds) {
          const cat = await this.categoryRepo.findOne({ where: { id: bid } });
          if (!cat) continue;
          try {
            const descs = await this.categoryRepo.findDescendants(cat);
            for (const d of descs) idSet.add(d.id);
          } catch {
            idSet.add(bid);
          }
        }
        const ids = Array.from(idSet);
        subtreeIds = ids;
      }
    }

    const buildQb = (
      categoryMode: 'none' | 'in' | 'not-in',
      catIds?: number[] | null,
    ) => {
      const base = this.productRepo
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.vendor', 'vendor')
        .leftJoinAndSelect('product.category', 'category');
      const { addedGeoRank } = applyFilters(base, {
        categoryMode,
        catIds: catIds || undefined,
      });
      applySorting(base, addedGeoRank);
      return base;
    };

    // category_first handling reuses the same filter/sort helpers to avoid divergence
    if (categoryFirst && subtreeIds && subtreeIds.length) {
      const startIndex = (page - 1) * perPage;

      const primaryQb = buildQb('in', subtreeIds);
      const othersQb = buildQb('not-in', subtreeIds);

      const primaryTotal = await primaryQb.getCount();
      const othersTotal = await othersQb.getCount();

      let items: Product[] = [];
      if (startIndex < primaryTotal) {
        const primaryItems = await primaryQb
          .skip(startIndex)
          .take(perPage)
          .getMany();
        if (primaryItems.length < perPage) {
          const remain = perPage - primaryItems.length;
          const otherItems = await othersQb.skip(0).take(remain).getMany();
          items = primaryItems.concat(otherItems);
        } else {
          items = primaryItems;
        }
      } else {
        const othersStart = startIndex - primaryTotal;
        items = await othersQb.skip(othersStart).take(perPage).getMany();
      }

      if (geoAppend && items.length < perPage) {
        const excludeIds = new Set(items.map((i) => i.id));
        const fillQb = buildQb('none');
        fillQb.andWhere('product.id NOT IN (:...exclude)', {
          exclude: Array.from(excludeIds).length ? Array.from(excludeIds) : [0],
        });
        const need = perPage - items.length;
        const fillItems = await fillQb.take(need).getMany();
        for (const it of fillItems) {
          if (items.length >= perPage) break;
          if (!excludeIds.has(it.id)) items.push(it);
        }
      }

      const total = primaryTotal + othersTotal;
      if (process.env.DEBUG_SQL === '1') {
        try {
          this.logger.debug(
            `(categoryFirst) primary SQL => ${primaryQb.getSql()}`,
          );
          this.logger.debug(
            `(categoryFirst) others SQL => ${othersQb.getSql()}`,
          );
        } catch {}
      }
      return {
        items: this.applyCurrencyList(items || [], targetCurrency),
        total: total || 0,
        perPage,
        currentPage: page,
        totalPages: Math.ceil(total / perPage),
      } as any;
    }

    // Standard path
    const catIdsForMain =
      includeDescendants && subtreeIds?.length
        ? subtreeIds
        : categoryIds.length && !includeDescendants && !categorySlug
          ? categoryIds
          : undefined;
    const categoryModeMain = catIdsForMain?.length ? 'in' : 'none';
    const qb = buildQb(categoryModeMain, catIdsForMain || undefined);
    qb.skip((page - 1) * perPage).take(perPage);
    const [items, total] = await qb.getManyAndCount();
    if (process.env.DEBUG_SQL === '1') {
      try {
        this.logger.debug(`SQL => ${qb.getSql()}`);
        this.logger.debug(`Params => ${JSON.stringify(qb.getParameters())}`);
      } catch {}
    }

    return {
      items: this.applyCurrencyList(items || [], targetCurrency),
      total: total || 0,
      perPage,
      currentPage: page,
      totalPages: Math.ceil(total / perPage),
    };
  }

  // Returns tiered buckets without merging: base (subcategory), siblings (same parent), parent (descendants), global
  async findTieredBuckets(q: TieredProductsDto): Promise<{
    base: Product[];
    siblings: Record<string, Product[]>; // key: sibling category id as string
    parent: Product[];
    global: Product[];
    meta: any;
  }> {
    const targetCurrency = this.normalizeCurrencyParam((q as any).currency);
    const page = Number((q as any).page || 1) || 1;
    const perBase = Math.min(
      Math.max(Number(q.perPage || q.limit) || 12, 1),
      50,
    );
    const perSibling = Math.min(Math.max(Number(q.perSibling ?? 6), 0), 24);
    const siblingCount = Math.min(Math.max(Number(q.siblingCount ?? 2), 0), 10);
    const parentLimit = Math.min(Math.max(Number(q.parentLimit ?? 12), 0), 50);
    const globalLimit = Math.min(Math.max(Number(q.globalLimit ?? 12), 0), 50);

    const baseFilters: ProductFilterDto = {
      ...q,
      perPage: perBase,
      currency: targetCurrency,
    } as any;
    const baseRes = await this.findFiltered(baseFilters);
    const base = baseRes.items;

    // Determine base subcategory and parent category
    let baseCatId: number | undefined = undefined;
    if (Array.isArray(q.categoryId) && q.categoryId.length)
      baseCatId = Number(q.categoryId[0]);
    // If categorySlug provided and no id, try resolving it
    if (!baseCatId && q.categorySlug) {
      const cat = await this.categoryRepo.findOne({
        where: { slug: q.categorySlug },
      });
      if (cat?.id) baseCatId = cat.id;
    }

    let parentId: number | undefined = q.siblingParentId as any;
    if (!parentId && baseCatId) {
      const cat = await this.categoryRepo
        .findOne({ where: { id: baseCatId }, relations: ['parent'] as any })
        .catch(() => null);
      parentId = cat?.parent?.id;
    }

    const siblings: Record<string, Product[]> = {};
    if (perSibling > 0 && siblingCount > 0 && parentId) {
      // Load siblings sorted by sortOrder, exclude the base category itself
      const parent = await this.categoryRepo
        .findOne({ where: { id: parentId }, relations: ['children'] as any })
        .catch(() => null);
      const kids = Array.isArray(parent?.children) ? parent.children : [];
      const ordered = kids
        .filter((c: any) => c && c.id && c.id !== baseCatId)
        .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .slice(0, siblingCount);
      for (const sib of ordered) {
        const res = await this.findFiltered({
          ...q,
          currency: targetCurrency,
          categoryId: [sib.id],
          includeDescendants: true,
          perPage: perSibling,
          page,
        } as any);
        siblings[String(sib.id)] = res.items;
      }
    }

    // Parent bucket: include descendants of the parent category (if found)
    let parentBucket: Product[] = [];
    if (parentLimit > 0 && (parentId || baseCatId)) {
      // Determine tree root for parent bucket: if parentId exists, use it; else use base category itself
      const rootId = parentId || baseCatId;
      const res = await this.findFiltered({
        ...q,
        currency: targetCurrency,
        categoryId: [rootId],
        includeDescendants: true,
        perPage: parentLimit,
        page,
      } as any);
      parentBucket = res.items;
    }

    // Global bucket: drop category filter, keep geo priority and sorts
    let globalBucket: Product[] = [];
    if (globalLimit > 0) {
      const { categoryId, categorySlug, ...rest } = q as any;
      const res = await this.findFiltered({
        ...rest,
        currency: targetCurrency,
        perPage: globalLimit,
        page,
        categoryFirst: false,
        includeDescendants: false,
      });
      globalBucket = res.items;
    }

    const meta = {
      base: { count: base.length, perPage: perBase },
      siblings: Object.fromEntries(
        Object.entries(siblings).map(([k, v]) => [
          k,
          { count: (v as any[]).length, perPage: perSibling },
        ]),
      ),
      parent: {
        count: parentBucket.length,
        limit: parentLimit,
        rootCategoryId: parentId || baseCatId || null,
      },
      global: { count: globalBucket.length, limit: globalLimit },
      geo: {
        userCountry: (q as any).userCountry || (q as any).country || null,
        userRegion: (q as any).userRegion || (q as any).region || null,
        userCity: (q as any).userCity || (q as any).city || null,
        geoPriority: !!(q as any).geoPriority,
        geoAppend: !!(q as any).geoAppend,
        eastAfrica: (q as any).eastAfrica || 'ET,SO,KE,DJ',
      },
    };

    return { base, siblings, parent: parentBucket, global: globalBucket, meta };
  }

  // Merge tiered buckets into a single ordered list using simple scoring
  async findTieredMerged(
    q: TieredProductsDto,
  ): Promise<{ items: Product[]; meta: any }> {
    const { base, siblings, parent, global, meta } =
      await this.findTieredBuckets(q);
    const eaList = (q as any).eastAfrica
      ? String((q as any).eastAfrica)
          .split(',')
          .map((c: string) => c.trim().toUpperCase())
      : ['ET', 'SO', 'KE', 'DJ'];
    const uc = (q as any).userCountry || (q as any).country || '';
    const ur = (q as any).userRegion || (q as any).region || '';
    const uci = (q as any).userCity || (q as any).city || '';
    const hardCap = Math.min(
      Math.max(Number((q as any).hardCap || 48), 1),
      200,
    );
    const antiClump = ((q as any).antiClump ?? true) ? true : false;

    type Tier = 'base' | 'sibling' | 'parent' | 'global';
    const tierWeight: Record<Tier, number> = {
      base: 1.0,
      sibling: 0.8,
      parent: 0.6,
      global: 0.4,
    };

    // Build candidate list with tier tag
    const siblingEntries: Array<{ item: Product; tier: Tier }> = [];
    for (const [sid, arr] of Object.entries(siblings || {})) {
      for (const it of arr) siblingEntries.push({ item: it, tier: 'sibling' });
    }
    const candidates: Array<{ item: Product; tier: Tier }> = [
      ...base.map((it) => ({ item: it, tier: 'base' as Tier })),
      ...siblingEntries,
      ...parent.map((it) => ({ item: it, tier: 'parent' as Tier })),
      ...global.map((it) => ({ item: it, tier: 'global' as Tier })),
    ];

    // De-duplicate by product.id (first occurrence kept)
    const seen = new Set<number>();
    const deduped = candidates.filter(({ item }) => {
      const id = (item as any).id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Compute normalization maxima for popularity
    let maxSales = 0,
      maxRatings = 0,
      maxViews = 0;
    for (const { item } of deduped) {
      maxSales = Math.max(maxSales, Number((item as any).sales_count || 0));
      maxRatings = Math.max(
        maxRatings,
        Number((item as any).rating_count || 0),
      );
      maxViews = Math.max(maxViews, Number((item as any).viewCount || 0));
    }

    const now = Date.now();
    const halfLifeDays = 14;

    function geoWeight(vendor: any): number {
      if (!vendor) return 0;
      const city = String(vendor.registrationCity || '').toLowerCase();
      const region = String(vendor.registrationRegion || '').toLowerCase();
      const country = String(vendor.registrationCountry || '').toUpperCase();
      const uciL = String(uci || '').toLowerCase();
      const urL = String(ur || '').toLowerCase();
      const ucU = String(uc || '').toUpperCase();
      if (uciL && city && uciL === city) return 0.3;
      if (urL && region && urL === region) return 0.2;
      if (ucU && country && ucU === country) return 0.1;
      if (country && eaList.includes(country)) return 0.05;
      return 0;
    }

    function recencyWeight(createdAt: any): number {
      const t = new Date(createdAt).getTime();
      if (!isFinite(t)) return 0;
      const ageDays = Math.max(0, (now - t) / (1000 * 60 * 60 * 24));
      const base = Math.exp(-ageDays / halfLifeDays);
      return 0.2 * base;
    }

    function popularityWeight(item: any): number {
      const s = Number(item.sales_count || 0);
      const r = Number(item.rating_count || 0);
      const v = Number(item.viewCount || 0);
      const sN = maxSales > 0 ? s / maxSales : 0;
      const rN = maxRatings > 0 ? r / maxRatings : 0;
      const vN = maxViews > 0 ? v / maxViews : 0;
      const mix = 0.5 * sN + 0.3 * rN + 0.2 * vN;
      return 0.2 * mix;
    }

    const scored = deduped.map(({ item, tier }) => {
      const tW = tierWeight[tier];
      const gW = geoWeight((item as any).vendor);
      const rec = recencyWeight((item as any).createdAt);
      const pop = popularityWeight(item as any);
      const score = tW + gW + rec + pop;
      return { item, tier, score };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // tie-breakers: recency desc, then id asc
      const at = new Date((a.item as any).createdAt).getTime();
      const bt = new Date((b.item as any).createdAt).getTime();
      if (bt !== at) return bt - at;
      return ((a.item as any).id || 0) - ((b.item as any).id || 0);
    });

    // Anti-clumping: avoid consecutive same vendor if possible by a simple swap pass
    const arranged: Product[] = [];
    if (antiClump) {
      for (const entry of scored) arranged.push(entry.item);
      for (let i = 1; i < arranged.length; i++) {
        const prevV = (arranged[i - 1] as any).vendor?.id;
        const curV = (arranged[i] as any).vendor?.id;
        if (prevV && curV && prevV === curV) {
          // try swap with next different vendor
          let swapIdx = i + 1;
          while (swapIdx < arranged.length) {
            const sv = (arranged[swapIdx] as any).vendor?.id;
            if (!sv || sv !== curV) break;
            swapIdx++;
          }
          if (swapIdx < arranged.length) {
            const tmp = arranged[i];
            arranged[i] = arranged[swapIdx];
            arranged[swapIdx] = tmp;
          }
        }
      }
    } else {
      for (const entry of scored) arranged.push(entry.item);
    }

    const items = arranged.slice(0, hardCap);
    const mergedMeta = {
      ...meta,
      merged: {
        totalCandidates: scored.length,
        hardCap,
        antiClump,
      },
    };
    return { items, meta: mergedMeta };
  }

  // Basic recommendation strategy:
  // - If user has reviews, prioritize products in same categories/tags
  // - Else, return featured + top-rated mix
  async recommendedForUser(
    userId: number,
    page = 1,
    perPage = 20,
  ): Promise<{
    items: Product[];
    total: number;
    perPage: number;
    currentPage: number;
    totalPages: number;
  }> {
    // Get categories from user's reviews
    const reviewed = await this.productRepo
      .createQueryBuilder('p')
      .innerJoin('p.reviews', 'r', 'r.userId = :userId', { userId })
      .leftJoin('p.category', 'c')
      .leftJoin('p.tags', 't')
      .select(['p.id', 'c.id', 't.id'])
      .limit(200)
      .getMany();

    const categoryIds = Array.from(
      new Set(reviewed.map((p) => p.category?.id).filter(Boolean)),
    );
    // We won’t extract tag IDs here deeply; keep it simple

    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.tags', 'tag')
      .leftJoinAndSelect('product.images', 'images')
      .andWhere('product.status = :status', { status: 'publish' })
      .andWhere('product.isBlocked = false')
      .andWhere('product.deleted_at IS NULL');

    if (categoryIds.length) {
      qb.andWhere('category.id IN (:...categoryIds)', { categoryIds });
    } else {
      qb.andWhere(
        '(product.featured = true OR product.average_rating IS NOT NULL)',
      );
    }

    qb.orderBy('product.average_rating', 'DESC', 'NULLS LAST')
      .addOrderBy('product.rating_count', 'DESC', 'NULLS LAST')
      .addOrderBy('product.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      perPage,
      currentPage: page,
      totalPages: Math.ceil(total / perPage),
    };
  }

  // ✅ NEW updateProduct method
  async updateProduct(
    id: number,
    updateData: UpdateProductDto,
    user: User,
  ): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    if (product.vendor.id !== user.id) {
      throw new ForbiddenException('You can only update your own products.');
    }

    const {
      tags,
      images,
      categoryId,
      listingType,
      bedrooms,
      listingCity,
      bathrooms,
      sizeSqm,
      furnished,
      rentPeriod,
      attributes,
      downloadKey,
      ...rest
    } = updateData;

    // Update simple properties
    Object.assign(product, rest);

    // Update category if provided
    if (categoryId !== undefined) {
      if (categoryId) {
        const category = await this.categoryRepo.findOneBy({ id: categoryId });
        if (!category) throw new NotFoundException('Category not found');
        product.category = category;
      } else {
        product.category = null;
      }
    }

    // Update tags if provided
    if (tags) {
      product.tags = await this.assignTags(tags);
    }

    // Update images if provided: delete old ones, add new ones
    if (images) {
      const normalizedImages = this.normalizeImagesInput(images);
      // Image URL host policy check removed in rollback
      product.imageUrl =
        normalizedImages.length > 0 ? normalizedImages[0].src : null;
      await this.productImageRepo.delete({ product: { id } }); // Delete old images
      if (normalizedImages.length) {
        const imageEntities = normalizedImages.map((img, index) =>
          this.productImageRepo.create({ ...img, product, sortOrder: index }),
        );
        await this.productImageRepo.save(imageEntities); // Save new images
      }
    }

    if (listingType !== undefined) {
      product.listingType = listingType as any;
    }
    if (bedrooms !== undefined) {
      product.bedrooms = (bedrooms as any) ?? null;
    }
    if (listingCity !== undefined)
      product.listingCity = (listingCity as any) ?? null;
    if (bathrooms !== undefined) product.bathrooms = (bathrooms as any) ?? null;
    if (sizeSqm !== undefined) product.sizeSqm = (sizeSqm as any) ?? null;
    if (typeof furnished !== 'undefined') product.furnished = furnished as any;
    if (rentPeriod !== undefined)
      product.rentPeriod = (rentPeriod as any) ?? null;
    if (attributes !== undefined)
      product.attributes = this.sanitizeAttributes(attributes) as any;
    // Mirror explicit downloadKey into attributes for digital products
    try {
      if (typeof downloadKey === 'string' && downloadKey) {
        const attrs =
          product.attributes && typeof product.attributes === 'object'
            ? { ...(product.attributes as any) }
            : {};
        if (!attrs.downloadKey) attrs.downloadKey = downloadKey;
        product.attributes = attrs;
      }
    } catch {}
    // Property validations using resulting state
    const finalCategory = product.category;
    const finalListingCity =
      listingCity !== undefined ? listingCity : product.listingCity;
    const finalListingType =
      listingType !== undefined ? listingType : product.listingType;
    const finalRentPeriod =
      rentPeriod !== undefined ? rentPeriod : product.rentPeriod;
    if (finalCategory && this.isPropertyCategory(finalCategory)) {
      if (!finalListingCity || !String(finalListingCity).trim()) {
        throw new BadRequestException(
          'listingCity is required for Property & Real Estate listings',
        );
      }
      if (
        finalListingType === 'rent' &&
        (!finalRentPeriod || !String(finalRentPeriod).trim())
      ) {
        throw new BadRequestException(
          'rentPeriod is required when listing_type is rent',
        );
      }
    }

    await this.productRepo.save(product);
    return this.findOne(id);
  }

  async promoteProduct(
    id: number,
    tier: BoostTier,
    user: { id: number },
  ): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    if (product.vendor.id !== user.id) {
      throw new ForbiddenException('You can only promote your own products.');
    }

    const option = BOOST_OPTIONS.find((o) => o.tier === tier);
    if (!option) {
      throw new BadRequestException('Invalid boost tier');
    }

    const durationMs = option.durationDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let currentExpiry = product.featuredExpiresAt
      ? new Date(product.featuredExpiresAt).getTime()
      : now;
    if (currentExpiry < now) {
      currentExpiry = now;
    }

    product.featured = true;
    product.featuredExpiresAt = new Date(currentExpiry + durationMs);

    // Record value of the boost
    try {
      const paidAmount = this.currencyService.convert(
        option.basePriceETB,
        'ETB',
        product.currency || 'ETB',
      );
      product.featuredPaidAmount = paidAmount;
      product.featuredPaidCurrency = product.currency || 'ETB';
    } catch (e) {
      // Fallback if conversion fails
      product.featuredPaidAmount = option.basePriceETB;
      product.featuredPaidCurrency = 'ETB';
    }

    await this.productRepo.save(product);
    return this.findOne(id);
  }

  async deleteProduct(
    id: number,
    user: Pick<User, 'id' | 'roles'>,
  ): Promise<{ deleted: boolean }> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor', 'images'],
    });
    if (!product) throw new NotFoundException('Product not found');
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const isAdminActor =
      roles.includes(UserRole.ADMIN) || roles.includes(UserRole.SUPER_ADMIN);
    if (product.vendor.id !== user.id && !isAdminActor)
      throw new ForbiddenException('You can only delete your own products');
    const hasOrders = await this.orderRepo.count({
      where: { items: { product: { id } } },
    });
    if (hasOrders > 0) {
      // Soft delete if orders exist to preserve history
      await this.productRepo.update(id, { deletedAt: new Date() });
      return { deleted: true };
    }
    // Best-effort media cleanup before deleting DB rows
    try {
      // 1) Collect candidate URLs/keys
      const keys = new Set<string>();
      const urls = new Set<string>();
      // Main imageUrl
      if ((product as any).imageUrl)
        urls.add(String((product as any).imageUrl));
      // Gallery images
      for (const img of product.images || []) {
        if (img?.src) urls.add(String(img.src));
        if (img?.thumbnailSrc) urls.add(String(img.thumbnailSrc));
        if (img?.lowResSrc) urls.add(String(img.lowResSrc));
      }
      // Attributes: digital download, video and poster
      const attrs =
        (product as any).attributes &&
        typeof (product as any).attributes === 'object'
          ? { ...(product as any).attributes }
          : {};
      // Canonical digital
      const dig = attrs.digital;
      if (
        dig &&
        typeof dig === 'object' &&
        dig.download &&
        typeof dig.download === 'object'
      ) {
        const k = dig.download.key;
        if (typeof k === 'string' && k) keys.add(k);
        const pub = dig.download.publicUrl;
        if (typeof pub === 'string' && pub) urls.add(pub);
      }
      // Legacy keys
      const legacyKey = attrs.downloadKey || attrs.download_key;
      if (typeof legacyKey === 'string' && legacyKey) keys.add(legacyKey);
      const videoUrl = attrs.videoUrl || attrs.video_url;
      if (typeof videoUrl === 'string' && videoUrl) urls.add(videoUrl);
      const posterUrl = attrs.posterUrl || attrs.posterSrc || attrs.poster_url;
      if (typeof posterUrl === 'string' && posterUrl) urls.add(posterUrl);

      // 2) Convert URLs to keys when they belong to our bucket
      for (const u of Array.from(urls)) {
        const key = this.doSpaces.urlToKeyIfInBucket(u);
        if (key) keys.add(key);
      }

      // 3) Offload deletion to Sunday Cron using MediaCleanupTask
      const tasks = Array.from(keys).map((key) =>
        this.cleanupRepo.create({
          key,
          reasonType: 'product_delete',
          reasonId: String(id),
        }),
      );
      if (tasks.length > 0) {
        await this.cleanupRepo.save(tasks);
      }
    } catch {
      // ignore cleanup errors
    }

    // Clean up associated rows in other tables before deleting the product
    try {
      // Remove reviews linked to this product
      await this.reviewRepo.delete({ product: { id } } as any);
    } catch {}
    try {
      // Remove lightweight impressions rows
      await this.impressionRepo.delete({ productId: id } as any);
    } catch {}
    try {
      // Remove this product ID from all users' favorites (best-effort)
      this.favorites.removeProductEverywhere(id).catch(() => {});
    } catch {}

    // Finally remove product (images will cascade via FK onDelete: CASCADE, join table tags will cascade via FKs)
    await this.productRepo.delete(id);
    return { deleted: true };
  }

  /** Admin moderation helpers. */
  async listPendingApproval(): Promise<any[]> {
    const rows = await this.productRepo.find({
      where: { status: 'pending_approval' as any, deletedAt: IsNull() },
      relations: ['vendor', 'category', 'tags', 'images'],
      order: { createdAt: 'DESC' },
    });
    return rows.map((p) => normalizeProductMedia(p as any));
  }

  async listForAdmin(opts: {
    status?: string;
    page?: number;
    perPage?: number;
    per_page?: number;
    q?: string;
    featured?: boolean;
  }): Promise<{
    items: Product[];
    total: number;
    page: number;
    perPage: number;
  }> {
    const page = Math.max(1, Number(opts?.page || 1));
    const perPage = Math.min(
      Math.max(Number(opts?.perPage || opts?.per_page || 20), 1),
      200,
    );
    const status = (opts?.status || 'pending_approval').trim();
    const q = (opts?.q || '').trim();
    // FEATURED FILTER: If "Active Ads" page requests only featured, allow ignoring status
    const filterFeatured =
      typeof opts?.featured === 'boolean' ? opts.featured : undefined;

    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.vendor', 'vendor')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.tags', 'tags')
      .leftJoinAndSelect('p.images', 'images')
      .where('p.deletedAt IS NULL');

    // Only apply status filter if not explicitly looking for all active featured items
    // OR if status refers to "publish" etc.
    if (status && status !== 'all') {
      qb.andWhere('p.status = :status', { status });
    }

    if (filterFeatured !== undefined) {
      qb.andWhere('p.featured = :featured', { featured: filterFeatured });
    }

    if (q) {
      qb.andWhere('(p.name ILIKE :q OR p.description ILIKE :q)', {
        q: `%${q}%`,
      });
    }

    qb.orderBy('p.createdAt', 'DESC');
    qb.skip((page - 1) * perPage).take(perPage);

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((p) => normalizeProductMedia(p as any)),
      total,
      page,
      perPage,
    };
  }

  async searchBasic(
    q: string,
  ): Promise<Array<{ id: number; name: string; imageUrl: string | null }>> {
    if (!q || !q.trim()) return [];

    // Simple search for published or active products, returning minimal data
    const qb = this.productRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.name'])
      .leftJoinAndSelect('p.images', 'images')
      .where('p.deletedAt IS NULL');

    // Prioritize "publish" but maybe allow finding anything if needed?
    // For notification "Find Product Image", we likely want valid public products.
    qb.andWhere('p.status = :status', { status: 'publish' });

    qb.andWhere('(p.name ILIKE :q)', { q: `%${q}%` });
    qb.take(20);

    const results = await qb.getMany();
    return results.map((p) => {
      const normalized = normalizeProductMedia(p as any);
      return {
        id: p.id,
        name: p.name,
        imageUrl: normalized.imageUrl || null,
      };
    });
  }

  // Admin Override for Featured Status
  async adminSetFeatured(
    id: number,
    featured: boolean,
    expiresAt?: Date,
    amountPaid?: number,
    currency?: string,
  ): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Product ID ${id} not found`);
    }

    product.featured = featured;
    if (featured) {
      // If featured is true, use provided date or default to 7 days (Admin default)
      if (expiresAt) {
        product.featuredExpiresAt = expiresAt;
      } else if (!product.featuredExpiresAt) {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        product.featuredExpiresAt = d;
      }
      // Save amount info
      if (typeof amountPaid === 'number')
        product.featuredPaidAmount = amountPaid;
      if (typeof currency === 'string') product.featuredPaidCurrency = currency;
    } else {
      product.featuredExpiresAt = null;
      product.featuredPaidAmount = null;
      product.featuredPaidCurrency = null;
    }

    return this.productRepo.save(product);
  }

  async approveProduct(
    id: number,
    opts: { actorId?: number | null } = {},
  ): Promise<Product> {
    const product = await this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.vendor', 'vendor')
      .addSelect('p.original_creator_contact')
      .where('p.id = :id', { id })
      .getOne();

    if (!product) throw new NotFoundException('Product not found');
    const previousStatus = (product as any).status || null;
    (product as any).status = 'publish';
    product.isBlocked = false;

    // Handle Guest/Customer product approval
    if (product.original_creator_contact) {
      // Find Suuq S Vendor
      const suuqVendor = await this.userRepo.findOne({
        where: [
          { displayName: 'Suuq S Vendor' },
          { storeName: 'Suuq S Vendor' },
          { email: 'suuq.s.vendor@suuq.com' },
        ],
      });

      if (suuqVendor) {
        product.vendor = suuqVendor;
      }

      // Send email notification
      const contact = product.original_creator_contact;
      if (contact.email) {
        const name = contact.name || 'User';
        await this.emailService.send({
          to: contact.email,
          subject: 'Your Product has been Approved!',
          text: `Hello ${name},\n\nYour product "${product.name}" has been approved by the Super Admin and is now live on Suuq S Vendor.\n\nThank you!`,
          html: `<p>Hello ${name},</p><p>Your product "<strong>${product.name}</strong>" has been approved by the Super Admin and is now live on Suuq S Vendor.</p><p>Thank you!</p>`,
        });
      }
    }

    await this.productRepo.save(product);
    await this.audit.log({
      actorId: opts.actorId ?? null,
      action: 'ADMIN_PRODUCT_APPROVE',
      targetType: 'PRODUCT',
      targetId: id,
      meta: { previousStatus, nextStatus: 'publish' },
    });

    // Notify normal vendor if not guest product
    if (product.vendor && !product.original_creator_contact) {
      await this.notifications.createAndDispatch({
        userId: product.vendor.id,
        title: 'Product Approved',
        body: `Your product "${product.name}" is now live!`,
        type: NotificationType.SYSTEM,
        data: {
          productId: String(id),
          route: `/product-detail?id=${id}`,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        image: product.imageUrl || undefined,
      });
    }

    return this.findOne(id);
  }

  async bulkApprove(
    ids: number[],
    opts: { actorId?: number | null } = {},
  ): Promise<{ updatedIds: number[]; notFoundIds: number[] }> {
    const uniqueIds = Array.from(
      new Set(
        (ids || [])
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    );
    if (!uniqueIds.length) return { updatedIds: [], notFoundIds: [] };
    const products = await this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.vendor', 'vendor')
      .addSelect('p.original_creator_contact')
      .where('p.id IN (:...ids)', { ids: uniqueIds })
      .getMany();

    const foundIds = products.map((p) => p.id);
    const notFoundIds = uniqueIds.filter((id) => !foundIds.includes(id));

    // Pre-fetch Suuq S Vendor if needed
    let suuqVendor: User | null = null;
    const needsVendorMove = products.some((p) => p.original_creator_contact);
    if (needsVendorMove) {
      suuqVendor = await this.userRepo.findOne({
        where: [
          { displayName: 'Suuq S Vendor' },
          { storeName: 'Suuq S Vendor' },
          { email: 'suuq.s.vendor@suuq.com' },
        ],
      });
    }

    for (const p of products) {
      const previousStatus = (p as any).status || null;
      (p as any).status = 'publish';
      p.isBlocked = false;

      if (p.original_creator_contact) {
        if (suuqVendor) {
          p.vendor = suuqVendor;
        }
        // Send email
        const contact = p.original_creator_contact;
        if (contact.email) {
          const name = contact.name || 'User';
          this.emailService
            .send({
              to: contact.email,
              subject: 'Your Product has been Approved!',
              text: `Hello ${name},\n\nYour product "${p.name}" has been approved by the Super Admin and is now live on Suuq S Vendor.\n\nThank you!`,
              html: `<p>Hello ${name},</p><p>Your product "<strong>${p.name}</strong>" has been approved by the Super Admin and is now live on Suuq S Vendor.</p><p>Thank you!</p>`,
            })
            .catch((e) =>
              this.logger.error(
                `Failed to send approval email for product ${p.id}`,
                e,
              ),
            );
        }
      }

      await this.audit.log({
        actorId: opts.actorId ?? null,
        action: 'ADMIN_PRODUCT_APPROVE',
        targetType: 'PRODUCT',
        targetId: p.id,
        meta: { previousStatus, nextStatus: 'publish', bulk: true },
      });
    }
    if (products.length) await this.productRepo.save(products);
    return { updatedIds: foundIds, notFoundIds };
  }

  async rejectProduct(
    id: number,
    opts: {
      actorId?: number | null;
      toStatus?: 'rejected' | 'draft';
      reason?: string | null;
    } = {},
  ): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    const nextStatus = opts.toStatus === 'draft' ? 'draft' : 'rejected';
    const previousStatus = (product as any).status || null;
    (product as any).status = nextStatus as any;
    product.isBlocked = nextStatus === 'rejected' ? true : product.isBlocked;
    await this.productRepo.save(product);
    await this.audit.log({
      actorId: opts.actorId ?? null,
      action: 'ADMIN_PRODUCT_REJECT',
      targetType: 'PRODUCT',
      targetId: id,
      reason: opts.reason ?? null,
      meta: { previousStatus, nextStatus },
    });
    return this.findOne(id);
  }

  async bulkReject(
    ids: number[],
    opts: {
      actorId?: number | null;
      toStatus?: 'rejected' | 'draft';
      reason?: string | null;
    } = {},
  ): Promise<{ updatedIds: number[]; notFoundIds: number[] }> {
    const uniqueIds = Array.from(
      new Set(
        (ids || [])
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    );
    if (!uniqueIds.length) return { updatedIds: [], notFoundIds: [] };
    const products = await this.productRepo.find({
      where: { id: In(uniqueIds) },
    });
    const foundIds = products.map((p) => p.id);
    const notFoundIds = uniqueIds.filter((id) => !foundIds.includes(id));
    const nextStatus = opts.toStatus === 'draft' ? 'draft' : 'rejected';
    for (const p of products) {
      const previousStatus = (p as any).status || null;
      (p as any).status = nextStatus as any;
      p.isBlocked = nextStatus === 'rejected' ? true : p.isBlocked;
      await this.audit.log({
        actorId: opts.actorId ?? null,
        action: 'ADMIN_PRODUCT_REJECT',
        targetType: 'PRODUCT',
        targetId: p.id,
        reason: opts.reason ?? null,
        meta: { previousStatus, nextStatus, bulk: true },
      });
    }
    if (products.length) await this.productRepo.save(products);
    return { updatedIds: foundIds, notFoundIds };
  }

  /** Admin soft delete: hide product from public while retaining data. Idempotent. */
  async softDeleteByAdmin(
    id: number,
    opts: { actorId?: number | null; reason?: string | null } = {},
  ): Promise<{
    id: number;
    softDeleted: boolean;
    alreadyDeleted?: boolean;
    previousStatus?: string | null;
  }> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    const already = !!product.deletedAt;
    const previousStatus = (product as any).status || null;
    if (!already) {
      product.deletedAt = new Date();
      product.deletedByAdminId = (opts.actorId ?? null) as any;
      product.deletedReason = (opts.reason ?? null) as any;
      // Also ensure it won't show up in public listings
      product.isBlocked = true;
      if (product.status === 'publish') (product as any).status = 'draft';
      await this.productRepo.save(product);
      await this.audit.log({
        actorId: opts.actorId ?? null,
        action: 'ADMIN_PRODUCT_SOFT_DELETE',
        targetType: 'PRODUCT',
        targetId: id,
        reason: opts.reason ?? null,
        meta: { previousStatus },
      });
      return { id, softDeleted: true, previousStatus };
    }
    return { id, softDeleted: false, alreadyDeleted: true, previousStatus };
  }

  /** Admin restore: reverse soft delete and keep product in draft for safety. */
  async restoreByAdmin(
    id: number,
    opts: { actorId?: number | null; reason?: string | null } = {},
  ): Promise<{ id: number; restored: boolean }> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    product.deletedAt = null as any;
    product.deletedByAdminId = null as any;
    product.deletedReason = null as any;
    // Keep it in draft and unblocked; vendor/admin can republish explicitly
    (product as any).status = 'draft';
    product.isBlocked = false;
    await this.productRepo.save(product);
    await this.audit.log({
      actorId: opts.actorId ?? null,
      action: 'ADMIN_PRODUCT_RESTORE',
      targetType: 'PRODUCT',
      targetId: id,
      reason: opts.reason ?? null,
    });
    return { id, restored: true };
  }

  /** Admin hard delete (SUPER_ADMIN): remove product permanently with best-effort media cleanup. */
  async hardDeleteByAdmin(
    id: number,
    opts: { actorId?: number | null; reason?: string | null } = {},
  ): Promise<{ deleted: boolean }> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['images'],
    });
    if (!product) throw new NotFoundException('Product not found');
    // Block deletion if orders reference the product to preserve history
    const hasOrders = await this.orderRepo.count({
      where: { items: { product: { id } } },
    });
    if (hasOrders > 0)
      throw new BadRequestException('Cannot hard-delete product with orders');

    // Best-effort media cleanup (same as vendor delete)
    try {
      const keys = new Set<string>();
      const urls = new Set<string>();
      if ((product as any).imageUrl)
        urls.add(String((product as any).imageUrl));
      for (const img of product.images || []) {
        if (img?.src) urls.add(String(img.src));
        if (img?.thumbnailSrc) urls.add(String(img.thumbnailSrc));
        if (img?.lowResSrc) urls.add(String(img.lowResSrc));
      }
      const attrs =
        (product as any).attributes &&
        typeof (product as any).attributes === 'object'
          ? { ...(product as any).attributes }
          : {};
      const dig = attrs.digital;
      if (
        dig &&
        typeof dig === 'object' &&
        dig.download &&
        typeof dig.download === 'object'
      ) {
        const k = dig.download.key;
        if (typeof k === 'string' && k) keys.add(k);
        const pub = dig.download.publicUrl;
        if (typeof pub === 'string' && pub) urls.add(pub);
      }
      const legacyKey = attrs.downloadKey || attrs.download_key;
      if (typeof legacyKey === 'string' && legacyKey) keys.add(legacyKey);
      const videoUrl = attrs.videoUrl || attrs.video_url;
      if (typeof videoUrl === 'string' && videoUrl) urls.add(videoUrl);
      const posterUrl = attrs.posterUrl || attrs.posterSrc || attrs.poster_url;
      if (typeof posterUrl === 'string' && posterUrl) urls.add(posterUrl);
      for (const u of Array.from(urls)) {
        const key = this.doSpaces.urlToKeyIfInBucket(u);
        if (key) keys.add(key);
      }
      for (const key of Array.from(keys)) {
        await this.doSpaces.deleteObject(key).catch(() => {});
      }
    } catch {}

    await this.productRepo.delete(id);
    await this.audit.log({
      actorId: opts.actorId ?? null,
      action: 'ADMIN_PRODUCT_HARD_DELETE',
      targetType: 'PRODUCT',
      targetId: id,
      reason: opts.reason ?? null,
    });
    return { deleted: true };
  }

  async assignTags(tagNames: string[]): Promise<Tag[]> {
    const existingTags = await this.tagRepo.find({
      where: { name: In(tagNames) },
    });
    const existingTagNames = existingTags.map((t) => t.name);
    const newTagNames = tagNames.filter(
      (name) => !existingTagNames.includes(name),
    );
    const newTags = this.tagRepo.create(newTagNames.map((name) => ({ name })));
    await this.tagRepo.save(newTags);
    return [...existingTags, ...newTags];
  }

  // ✨ FIX: ADDED MISSING METHODS

  async toggleBlockStatus(id: number, isBlocked: boolean): Promise<Product> {
    await this.productRepo.update(id, { isBlocked });
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor', 'category', 'tags', 'images'],
    });
    if (!product) throw new NotFoundException('Product not found');
    return normalizeProductMedia(product) as any;
  }

  async toggleFeatureStatus(id: number, featured: boolean): Promise<Product> {
    // Fetch the product first to check expiry
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor', 'category', 'tags', 'images'],
    });
    if (!product) throw new NotFoundException('Product not found');

    const update: Partial<Product> = { featured };
    if (featured) {
      // If no expiry is set, default to 3 days from now
      if (!product.featuredExpiresAt) {
        const now = new Date();
        const expires = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        update.featuredExpiresAt = expires;
      }
    } else {
      // Optionally clear expiry when unfeaturing
      update.featuredExpiresAt = null;
    }
    await this.productRepo.update(id, update);
    const updated = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor', 'category', 'tags', 'images'],
    });
    return normalizeProductMedia(updated) as any;
  }

  async suggestNames(
    query: string,
    limit = 8,
  ): Promise<
    {
      name: string;
      isCertified: boolean;
      isFeatured: boolean;
      // Legacy alias kept for backward compatibility
      isPro: boolean;
    }[]
  > {
    const q = (query || '').trim();
    // Allow 1-character inputs; only block truly empty
    if (q.length === 0) return [];
    const lim = Math.min(Math.max(Number(limit) || 8, 1), 10);
    const propIds = await this.getPropertySubtreeIds();
    const hasProp = propIds.length > 0 ? 1 : 0;

    // Pre-fetch sizes to keep the query cheap
    const prePrefix = Math.min(lim * 4, 40);
    const preContain = Math.min(lim * 6, 60);

    // Use raw SQL for UNION + DISTINCT ON ordering
    const sql = `
      WITH candidates AS (
        (
          SELECT p.name AS name,
                 LOWER(p.name) AS lower_name,
                 1 AS prefix_boost,
                 CASE WHEN $1 = 1 AND p."categoryId" = ANY($4::int[]) THEN 1 ELSE 0 END AS property_boost,
                 -- Certification boost: verified vendors are prioritized (legacy PRO kept for compatibility)
                 CASE WHEN v."verificationStatus" = 'APPROVED' OR v."subscriptionTier" = 'pro' THEN 1000000 ELSE 0 END AS tier_boost,
                 CASE WHEN p.featured = true THEN 2000000 ELSE 0 END AS featured_boost,
                 p.featured,
                 (COALESCE(p.sales_count, 0) * 3 + COALESCE(p."view_count", 0))::bigint AS popularity,
                 p."createdAt" AS created_at
          FROM "product" p
          LEFT JOIN "user" v ON p."vendorId" = v.id
          WHERE p.status = 'publish' AND p."isBlocked" = false AND p.name ILIKE $2
          LIMIT ${prePrefix}
        )
        UNION ALL
        (
          SELECT p.name AS name,
                 LOWER(p.name) AS lower_name,
                 0 AS prefix_boost,
                 CASE WHEN $1 = 1 AND p."categoryId" = ANY($4::int[]) THEN 1 ELSE 0 END AS property_boost,
                 -- Certification boost: verified vendors are prioritized (legacy PRO kept for compatibility)
                 CASE WHEN v."verificationStatus" = 'APPROVED' OR v."subscriptionTier" = 'pro' THEN 1000000 ELSE 0 END AS tier_boost,
                 CASE WHEN p.featured = true THEN 2000000 ELSE 0 END AS featured_boost,
                 p.featured,
                 (COALESCE(p.sales_count, 0) * 3 + COALESCE(p."view_count", 0))::bigint AS popularity,
                 p."createdAt" AS created_at
          FROM "product" p
          LEFT JOIN "user" v ON p."vendorId" = v.id
          WHERE p.status = 'publish' AND p."isBlocked" = false AND p.name ILIKE $3
          LIMIT ${preContain}
        )
      )
            SELECT name, 
              CASE WHEN tier_boost > 0 THEN true ELSE false END as "isCertified",
              CASE WHEN tier_boost > 0 THEN true ELSE false END as "isPro",
              featured as "isFeatured"
      FROM (
        SELECT DISTINCT ON (lower_name) 
          name, 
          tier_boost, 
          featured_boost,
          prefix_boost, 
          property_boost, 
          popularity, 
          created_at,
          featured
        FROM candidates
        ORDER BY lower_name, featured_boost DESC, tier_boost DESC, prefix_boost DESC, property_boost DESC, popularity DESC, created_at DESC
      ) q
      ORDER BY featured_boost DESC, tier_boost DESC, prefix_boost DESC, property_boost DESC, popularity DESC, created_at DESC
      LIMIT ${lim}
    `;

    const rows: Array<{
      name: string;
      isCertified: boolean;
      isPro: boolean;
      isFeatured: boolean;
    }> = await this.productRepo.query(sql, [
      hasProp,
      `${q}%`,
      `%${q}%`,
      propIds.length ? propIds : [0],
    ]);

    const seen = new Set<string>();
    const out: {
      name: string;
      isCertified: boolean;
      isPro: boolean;
      isFeatured: boolean;
    }[] = [];
    for (const r of rows) {
      const name = (r?.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name,
        isCertified: !!r.isCertified,
        isPro: !!r.isPro,
        isFeatured: !!r.isFeatured,
      });
      if (out.length >= lim) break;
    }
    return out;
  }

  async getRecentViewers(productId: number, limit = 5): Promise<string[]> {
    const impressions = await this.impressionRepo.find({
      where: { productId, userId: Not(IsNull()) },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: 20, // Fetch more to handle potential duplicate users
    });

    const uniqueAvatars = new Set<string>();
    const avatars: string[] = [];

    for (const imp of impressions) {
      if (imp.user) {
        const avatar = imp.user.vendorAvatarUrl || imp.user.avatarUrl;
        if (avatar && !uniqueAvatars.has(avatar)) {
          uniqueAvatars.add(avatar);
          avatars.push(avatar);
        }
      }
      if (avatars.length >= limit) break;
    }

    return avatars;
  }
}
