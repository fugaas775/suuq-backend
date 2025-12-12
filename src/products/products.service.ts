import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan, TreeRepository } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { Product } from './entities/product.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductImage } from './entities/product-image.entity';
import { ProductFilterDto } from './dto/ProductFilterDto';
import { TieredProductsDto } from './dto/tiered-products.dto';
import { Tag } from '../tags/tag.entity';
import { ProductImpression } from './entities/product-impression.entity';
import { SearchKeyword } from './entities/search-keyword.entity';
import { createHash } from 'crypto';
import { normalizeProductMedia } from '../common/utils/media-url.util';
import { normalizeDigitalAttributes } from '../common/utils/digital.util';
import { GeoResolverService } from '../common/services/geo-resolver.service';
import { UserRole } from '../auth/roles.enum';
// import { assertAllowedMediaUrl } from '../common/utils/media-policy.util';
import { DoSpacesService } from '../media/do-spaces.service';
import { AuditService } from '../audit/audit.service';
import { Review } from '../reviews/entities/review.entity';
import { FavoritesService } from '../favorites/favorites.service';
import { qbCacheIfEnabled } from '../common/utils/db-cache.util';

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
    private readonly doSpaces: DoSpacesService,
    private readonly audit: AuditService,
    private readonly geo: GeoResolverService,
    private readonly favorites: FavoritesService,
  ) {}

  // Simple in-memory cache for Property & Real Estate subtree ids
  private propertyIdsCache: { ids: number[]; at: number } | null = null;

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
        'product.viewCount',
        'product.listingType',
        'product.bedrooms',
        'product.listingCity',
        'product.bathrooms',
        'product.sizeSqm',
        'product.furnished',
        'product.rentPeriod',
        'product.createdAt',
        'vendor.id',
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

    const vendor = await this.userRepo.findOneBy({ id: vendorId });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
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

    const product = this.productRepo.create({
      ...rest,
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
      imageUrl: images.length > 0 ? images[0].src : null,
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
    if (images.length > 0) {
      const imageEntities = images.map((imageObj, index) =>
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

  async findOne(id: number): Promise<Product> {
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
          this.logger.log(
            `ProductsService.findOne prefill id=${id} attrs=${JSON.stringify(preview)}`,
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
                  .includes(id);
              if (should) {
                const raw = a ? JSON.stringify(a) : 'null';
                this.logger.warn(`DEBUG rawAttrs id=${id} attrs=${raw}`);
              }
            }
          } catch {}
        } catch {}
      } catch {}
      return out;
    } catch {
      return product;
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
      where: { id: productId },
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
  // - Return lean normalized media for client usage
  async findRelatedProducts(
    productId: number,
    opts?: { limit?: number; city?: string | null },
  ): Promise<any[]> {
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
      'product.imageUrl',
      'product.average_rating',
      'product.rating_count',
      'product.sales_count',
      'product.createdAt',
      'product.listingType',
      'product.listingCity',
      'vendor.id',
      'vendor.storeName',
      'vendor.displayName',
      'vendor.email',
      'vendor.avatarUrl',
      'vendor.verified',
      'category.id',
      'category.slug',
    ]);

    const rows = await qb.getMany();
    // Normalize media fields for client compatibility
    return rows.map((p) => normalizeProductMedia(p as any));
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
        country = cc ? cc.toUpperCase() : null;
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
              if (cc) vc = cc.toUpperCase();
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
  ): Promise<{ recorded: number; ignored: number }> {
    const cutoff = new Date(Date.now() - windowSeconds * 1000);
    let recorded = 0;
    let ignored = 0;
    // Fetch existing recent impressions for these products and session
    const existing = await this.impressionRepo.find({
      where: {
        sessionKey,
        productId: In(productIds),
        createdAt: MoreThan(cutoff),
      } as any,
    });
    const existingSet = new Set(existing.map((e) => e.productId));
    const toInsert = productIds.filter((id) => !existingSet.has(id));
    if (toInsert.length) {
      const rows = toInsert.map((productId) =>
        this.impressionRepo.create({ productId, sessionKey }),
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
    ignored = productIds.length - recorded;
    return { recorded, ignored };
  }

  async findFiltered(filters: ProductFilterDto): Promise<{
    items: Product[];
    total: number;
    perPage: number;
    currentPage: number;
    totalPages: number;
  }> {
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

    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.category', 'category');

    // Do not select all vendor columns by default; select minimal fields in grid view

    // Lean projection for grid views: limit selected columns
    if (view === 'grid') {
      qb.select([
        'product.id',
        'product.name',
        'product.price',
        'product.currency',
        'product.imageUrl',
        'product.average_rating',
        'product.rating_count',
        'product.sales_count',
        'product.viewCount',
        'product.listingType',
        'product.bedrooms',
        'product.listingCity',
        'product.bathrooms',
        'product.sizeSqm',
        'product.furnished',
        'product.rentPeriod',
        'product.createdAt',
        // minimal vendor fields needed for product cards and ranking
        'vendor.id',
        'vendor.email',
        'vendor.displayName',
        'vendor.avatarUrl',
        'vendor.storeName',
        'vendor.verified',
        'category.id',
        'category.slug',
      ]);
    } else {
      qb.leftJoinAndSelect('product.tags', 'tag').leftJoinAndSelect(
        'product.images',
        'images',
      );
    }

    // Only show published and not blocked products
    qb.andWhere('product.status = :status', { status: 'publish' }).andWhere(
      'product.isBlocked = false',
    );

    if (search)
      qb.andWhere('product.name ILIKE :search', { search: `%${search}%` });
    if (categorySlug)
      qb.andWhere('category.slug = :categorySlug', { categorySlug });
    else if (categoryIds.length && !includeDescendants && !categoryFirst)
      qb.andWhere('category.id IN (:...categoryIds)', { categoryIds });
    if (vendorId) qb.andWhere('vendor.id = :vendorId', { vendorId });
    if (typeof featured === 'boolean')
      qb.andWhere('product.featured = :featured', { featured });
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
        { tagList },
      );
    }
    if (priceMin !== undefined)
      qb.andWhere('product.price >= :priceMin', { priceMin });
    if (priceMax !== undefined)
      qb.andWhere('product.price <= :priceMax', { priceMax });
    // Normalize listing type (accept camelCase or snake_case; ignore empty/invalid)
    const rawLt = listing_type ?? listingType;
    const ltNorm =
      typeof rawLt === 'string' ? rawLt.trim().toLowerCase() : undefined;
    const listingTypeMode =
      (filters as any).listingTypeMode || (filters as any).listing_type_mode;
    const ltValid =
      ltNorm && (ltNorm === 'sale' || ltNorm === 'rent') ? ltNorm : undefined;
    if (ltValid) {
      if (listingTypeMode === 'priority') {
        // Priority mode: do NOT filter, but rank matching listing_type highest
        qb.addSelect(
          `CASE WHEN product.listing_type = :lt THEN 1 ELSE 0 END`,
          'lt_priority_rank',
        );
        // Ensure the :lt parameter is bound; otherwise Postgres will see a raw ':' and error
        qb.setParameter('lt', ltValid);
        qb.addOrderBy('lt_priority_rank', 'DESC');
      } else {
        qb.andWhere('product.listing_type = :lt', { lt: ltValid });
        this.logger.debug(`Applied listingType filter: ${ltValid}`);
      }
    }
    // Bedrooms filter: exact or range
    const brExact = bedrooms;
    const brMin = bedrooms_min ?? bedroomsMin;
    const brMax = bedrooms_max ?? bedroomsMax;
    if (brExact !== undefined)
      qb.andWhere('product.bedrooms = :br', { br: brExact });
    if (brMin !== undefined)
      qb.andWhere('product.bedrooms >= :brMin', { brMin });
    if (brMax !== undefined)
      qb.andWhere('product.bedrooms <= :brMax', { brMax });

    // Property city filter
    const listingCityFilter = (filters as any).listing_city;
    if (listingCityFilter) {
      qb.andWhere('LOWER(product.listing_city) = LOWER(:lc)', {
        lc: listingCityFilter,
      });
    } else if (userCity && ltValid) {
      // When userCity is provided alongside a listingType filter, treat it as a strict property city filter
      qb.andWhere('LOWER(product.listing_city) = LOWER(:userLC)', {
        userLC: userCity,
      });
    }

    // Bathrooms range (optional)
    const baths = (filters as any).bathrooms;
    const bathsMin = (filters as any).bathrooms_min;
    const bathsMax = (filters as any).bathrooms_max;
    if (baths !== undefined)
      qb.andWhere('product.bathrooms = :baths', { baths });
    if (bathsMin !== undefined)
      qb.andWhere('product.bathrooms >= :bathsMin', { bathsMin });
    if (bathsMax !== undefined)
      qb.andWhere('product.bathrooms <= :bathsMax', { bathsMax });

    // Geo handling
    // Optional distance computation (vendor.locationLat/Lng -> product.distanceKm)
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
    const radius = Number.isFinite(Number(radiusKm))
      ? Math.max(0, Number(radiusKm))
      : Number.isFinite(Number(maxDistanceKm))
        ? Math.max(0, Number(maxDistanceKm))
        : undefined;
    if (hasCoords) {
      // Haversine formula (km). Earth radius ~6371km.
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
      // Radius filter if provided
      if (typeof radius === 'number' && isFinite(radius) && radius > 0) {
        qb.andWhere(`(${dExpr}) <= :radiusKm`, {
          lat: latNum,
          lng: lngNum,
          radiusKm: radius,
        });
      }
    }
    // If geoPriority mode is enabled, we DO NOT hard filter; we rank by proximity of vendor profile fields to user provided geo.
    // Otherwise, we apply strict filters if supplied.
    let addedGeoRank = false;
    if (geoPriority) {
      // Property-aware geo rank: prefer product.listing_city for Property/Real Estate categories
      const propIds = await this.getPropertySubtreeIds().catch(() => []);
      const hasPropCats = Array.isArray(propIds) && propIds.length > 0 ? 1 : 0;
      // Normalize inputs and parameterize to avoid SQL injection
      const eaList = (filters as any).eastAfrica
        ? String((filters as any).eastAfrica)
            .split(',')
            .map((c: string) => c.trim().toUpperCase())
        : ['ET', 'SO', 'KE', 'DJ'];
      const uc = userCountry || country || '';
      const ur = userRegion || region || '';
      const uci = userCity || city || '';
      const eastAfricaSqlList = eaList.map((_, i) => `:ea${i}`).join(',');
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
        propIds: hasPropCats ? propIds : [0],
        ...Object.fromEntries(eaList.map((v, i) => [`ea${i}`, v])),
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
        qb.andWhere('LOWER(vendor.registrationCity) = LOWER(:city)', { city });
    }

    // If includeDescendants is true, expand filter to include all descendant category IDs
    let subtreeIds: number[] | null = null;
    if (
      (includeDescendants || categoryFirst) &&
      ((categoryIds && categoryIds.length) || categorySlug)
    ) {
      // Resolve base category id via slug if needed
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
        if (ids.length && !categoryFirst) {
          qb.andWhere('category.id IN (:...catIds)', { catIds: ids });
        }
      }
    }

    // Sorting options
    // best_match: geo (if any) -> sales -> rating -> recency
    if (sort === 'best_match') {
      if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
      qb.addOrderBy('product.sales_count', 'DESC', 'NULLS LAST')
        .addOrderBy('product.average_rating', 'DESC', 'NULLS LAST')
        .addOrderBy('product.rating_count', 'DESC', 'NULLS LAST')
        .addOrderBy('product.createdAt', 'DESC');
    } else if (
      (sort === 'distance_asc' || sort === 'distance_desc') &&
      hasCoords
    ) {
      // Distance sort when coordinates available; fallback to createdAt
      if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
      qb.addOrderBy(
        'distance_km',
        sort === 'distance_desc' ? 'DESC' : 'ASC',
        'NULLS LAST',
      );
      qb.addOrderBy('product.createdAt', 'DESC');
    } else if (!sort || sort === 'created_desc' || sort === '') {
      // If geoPriority is active but no explicit sort, approximate best_match; otherwise use recency
      if (addedGeoRank) {
        qb.orderBy('geo_rank', 'DESC');
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

    // If asked to prioritize category subtree first, perform union-like pagination
    if (categoryFirst && subtreeIds && subtreeIds.length) {
      // Precompute property subtree ids for geo ranking in this branch
      const propIdsLocal = await this.getPropertySubtreeIds().catch(() => []);
      const hasPropCatsLocal =
        Array.isArray(propIdsLocal) && propIdsLocal.length > 0 ? 1 : 0;
      // Helper to build a base QB with all filters except the category constraint
      const buildBase = () => {
        const q = this.productRepo
          .createQueryBuilder('product')
          .leftJoinAndSelect('product.vendor', 'vendor')
          .leftJoinAndSelect('product.category', 'category');
        if (view === 'grid') {
          q.select([
            'product.id',
            'product.name',
            'product.price',
            'product.currency',
            'product.imageUrl',
            'product.average_rating',
            'product.rating_count',
            'product.sales_count',
            'product.viewCount',
            'product.listingType',
            'product.bedrooms',
            'product.listingCity',
            'product.bathrooms',
            'product.sizeSqm',
            'product.furnished',
            'product.rentPeriod',
            'product.createdAt',
            'vendor.id',
            'category.id',
            'category.slug',
          ]);
        } else {
          q.leftJoinAndSelect('product.tags', 'tag').leftJoinAndSelect(
            'product.images',
            'images',
          );
        }
        q.andWhere('product.status = :status', { status: 'publish' }).andWhere(
          'product.isBlocked = false',
        );
        if (search)
          q.andWhere('product.name ILIKE :search', { search: `%${search}%` });
        if (vendorId) q.andWhere('vendor.id = :vendorId', { vendorId });
        if (typeof featured === 'boolean')
          q.andWhere('product.featured = :featured', { featured });
        if (tags) {
          const tagList = Array.isArray(tags)
            ? (tags as string[]).map((t) => String(t).trim())
            : String(tags)
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
          q.innerJoin(
            'product.tags',
            'tagFilter',
            'tagFilter.name IN (:...tagList)',
            { tagList },
          );
        }
        if (priceMin !== undefined)
          q.andWhere('product.price >= :priceMin', { priceMin });
        if (priceMax !== undefined)
          q.andWhere('product.price <= :priceMax', { priceMax });

        const rawLtLocal = listing_type ?? listingType;
        const ltNormLocal =
          typeof rawLtLocal === 'string'
            ? rawLtLocal.trim().toLowerCase()
            : undefined;
        const ltValidLocal =
          ltNormLocal && (ltNormLocal === 'sale' || ltNormLocal === 'rent')
            ? ltNormLocal
            : undefined;
        if (ltValidLocal) {
          if (listingTypeMode === 'priority') {
            q.addSelect(
              `CASE WHEN product.listing_type = :ltLocal THEN 1 ELSE 0 END`,
              'lt_priority_rank',
            );
            // Bind parameter used inside addSelect expression
            q.setParameter('ltLocal', ltValidLocal);
            q.addOrderBy('lt_priority_rank', 'DESC');
          } else {
            q.andWhere('product.listing_type = :ltLocal', {
              ltLocal: ltValidLocal,
            });
            this.logger.debug(
              `Applied listingType filter (categoryFirst branch): ${ltValidLocal}`,
            );
          }
        }
        const brExactLocal = bedrooms;
        const brMinLocal = bedrooms_min ?? bedroomsMin;
        const brMaxLocal = bedrooms_max ?? bedroomsMax;
        if (brExactLocal !== undefined)
          q.andWhere('product.bedrooms = :brLocal', { brLocal: brExactLocal });
        if (brMinLocal !== undefined)
          q.andWhere('product.bedrooms >= :brMinLocal', { brMinLocal });
        if (brMaxLocal !== undefined)
          q.andWhere('product.bedrooms <= :brMaxLocal', { brMaxLocal });

        const listingCityFilterLocal = (filters as any).listing_city;
        if (listingCityFilterLocal) {
          q.andWhere('LOWER(product.listing_city) = LOWER(:lcLocal)', {
            lcLocal: listingCityFilterLocal,
          });
        } else if (userCity && ltValidLocal) {
          q.andWhere('LOWER(product.listing_city) = LOWER(:userLcLocal)', {
            userLcLocal: userCity,
          });
        }

        const bathsLocal = (filters as any).bathrooms;
        const bathsMinLocal = (filters as any).bathrooms_min;
        const bathsMaxLocal = (filters as any).bathrooms_max;
        if (bathsLocal !== undefined)
          q.andWhere('product.bathrooms = :bathsLocal', { bathsLocal });
        if (bathsMinLocal !== undefined)
          q.andWhere('product.bathrooms >= :bathsMinLocal', { bathsMinLocal });
        if (bathsMaxLocal !== undefined)
          q.andWhere('product.bathrooms <= :bathsMaxLocal', { bathsMaxLocal });

        // Geo handling
        let addedGeoRankLocal = false;
        if (geoPriority) {
          const eaList = (filters as any).eastAfrica
            ? String((filters as any).eastAfrica)
                .split(',')
                .map((c: string) => c.trim().toUpperCase())
            : ['ET', 'SO', 'KE', 'DJ'];
          const uc = userCountry || country || '';
          const ur = userRegion || region || '';
          const uci = userCity || city || '';
          const eastAfricaSqlList = eaList
            .map((_, i) => `:ea_local_${i}`)
            .join(',');
          const geoRankExpr = `CASE 
        WHEN (:uci_local <> '' AND LOWER(product."listing_city") = LOWER(:uci_local) AND :hasProp_local = 1 AND category.id IN (:...propIds_local)) THEN 5
        WHEN (:uci_local <> '' AND LOWER(vendor."registrationCity") = LOWER(:uci_local)) THEN 4
        WHEN (:ur_local <> '' AND LOWER(vendor."registrationRegion") = LOWER(:ur_local)) THEN 3
        WHEN (:uc_local <> '' AND LOWER(vendor."registrationCountry") = LOWER(:uc_local)) THEN 2
        WHEN UPPER(COALESCE(vendor."registrationCountry", '')) IN (${eastAfricaSqlList}) THEN 1
        ELSE 0 END`;
          q.addSelect(geoRankExpr, 'geo_rank').setParameters({
            uci_local: uci,
            ur_local: ur,
            uc_local: uc,
            hasProp_local: hasPropCatsLocal,
            propIds_local: hasPropCatsLocal ? propIdsLocal : [0],
            ...Object.fromEntries(eaList.map((v, i) => [`ea_local_${i}`, v])),
          });
          addedGeoRankLocal = true;
        } else {
          if (country)
            q.andWhere('LOWER(vendor.registrationCountry) = LOWER(:country)', {
              country,
            });
          if (region)
            q.andWhere('LOWER(vendor.registrationRegion) = LOWER(:region)', {
              region,
            });
          if (city)
            q.andWhere('LOWER(vendor.registrationCity) = LOWER(:city)', {
              city,
            });
        }

        // Optional distance computation (repeated for local builder)
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
          q.addSelect(dExpr, 'distance_km').setParameters({
            lat: latNum,
            lng: lngNum,
          });
          if (typeof radius === 'number' && isFinite(radius) && radius > 0) {
            q.andWhere(`(${dExpr}) <= :radiusKm`, {
              lat: latNum,
              lng: lngNum,
              radiusKm: radius,
            });
          }
        }

        // Sorting
        if (sort === 'best_match') {
          if (addedGeoRankLocal) q.orderBy('geo_rank', 'DESC');
          q.addOrderBy('product.sales_count', 'DESC', 'NULLS LAST')
            .addOrderBy('product.average_rating', 'DESC', 'NULLS LAST')
            .addOrderBy('product.rating_count', 'DESC', 'NULLS LAST')
            .addOrderBy('product.createdAt', 'DESC');
        } else if (
          (sort === 'distance_asc' || sort === 'distance_desc') &&
          hasCoords
        ) {
          if (addedGeoRankLocal) q.orderBy('geo_rank', 'DESC');
          q.addOrderBy(
            'distance_km',
            sort === 'distance_desc' ? 'DESC' : 'ASC',
            'NULLS LAST',
          );
          q.addOrderBy('product.createdAt', 'DESC');
        } else if (!sort || sort === 'created_desc' || sort === '') {
          if (addedGeoRankLocal) {
            q.orderBy('geo_rank', 'DESC');
            q.addOrderBy('product.sales_count', 'DESC', 'NULLS LAST')
              .addOrderBy('product.average_rating', 'DESC', 'NULLS LAST')
              .addOrderBy('product.createdAt', 'DESC');
          } else {
            q.addOrderBy('product.createdAt', 'DESC');
          }
        } else if (sort === 'price_asc') {
          if (addedGeoRankLocal) q.orderBy('geo_rank', 'DESC');
          q.addOrderBy('product.price', 'ASC', 'NULLS LAST');
        } else if (sort === 'price_desc') {
          if (addedGeoRankLocal) q.orderBy('geo_rank', 'DESC');
          q.addOrderBy('product.price', 'DESC', 'NULLS LAST');
        } else if (sort === 'rating_desc') {
          if (addedGeoRankLocal) q.orderBy('geo_rank', 'DESC');
          q.addOrderBy('product.average_rating', 'DESC', 'NULLS LAST')
            .addOrderBy('product.rating_count', 'DESC', 'NULLS LAST')
            .addOrderBy('product.createdAt', 'DESC');
        } else if (sort === 'sales_desc') {
          if (addedGeoRankLocal) q.orderBy('geo_rank', 'DESC');
          q.addOrderBy('product.sales_count', 'DESC', 'NULLS LAST').addOrderBy(
            'product.createdAt',
            'DESC',
          );
        } else if (sort === 'views_desc') {
          if (addedGeoRankLocal) q.orderBy('geo_rank', 'DESC');
          q.addOrderBy('product.viewCount', 'DESC', 'NULLS LAST').addOrderBy(
            'product.createdAt',
            'DESC',
          );
        } else {
          if (addedGeoRankLocal) q.orderBy('geo_rank', 'DESC');
          q.addOrderBy('product.createdAt', 'DESC');
        }
        return q;
      };

      const perPage = Math.min(Math.max(Number(rawPerPage) || 20, 1), 100);
      const startIndex = (page - 1) * perPage;

      const primaryQb = buildBase().andWhere('category.id IN (:...catIds)', {
        catIds: subtreeIds,
      });
      const othersQb = buildBase().andWhere('category.id NOT IN (:...catIds)', {
        catIds: subtreeIds,
      });

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

      // Optional geo append: if page underfilled, top up with geo-ranked items from outside the union (keep total unchanged)
      let geoAppended = 0;
      if (geoAppend && items.length < perPage) {
        const excludeIds = new Set(items.map((i) => i.id));
        const fillQb = buildBase();
        // Drop category constraints and exclude already included ids
        fillQb.andWhere('product.id NOT IN (:...exclude)', {
          exclude: Array.from(excludeIds).length ? Array.from(excludeIds) : [0],
        });
        // Favor geo rank if available
        if (!geoPriority) {
          // If geoPriority isn’t on, adding geoAppend should not silently change ranking; we’ll only use existing sort
        }
        const need = perPage - items.length;
        const fillItems = await fillQb.take(need).getMany();
        // Concatenate while preserving order
        for (const it of fillItems) {
          if (items.length >= perPage) break;
          if (!excludeIds.has(it.id)) items.push(it);
        }
        geoAppended = Math.max(0, items.length - (perPage - need));
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
        items: items || [],
        total: total || 0,
        perPage,
        currentPage: page,
        totalPages: Math.ceil(total / perPage),
      } as any;
    }

    qb.skip((page - 1) * perPage).take(perPage);
    const [items, total] = await qb.getManyAndCount();
    if (process.env.DEBUG_SQL === '1') {
      try {
        this.logger.debug(`SQL => ${qb.getSql()}`);
        this.logger.debug(`Params => ${JSON.stringify(qb.getParameters())}`);
      } catch {}
    }

    return {
      items: items || [],
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
      .leftJoinAndSelect('product.images', 'images');

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
      // Image URL host policy check removed in rollback
      product.imageUrl = images.length > 0 ? images[0].src : null;
      await this.productImageRepo.delete({ product: { id } }); // Delete old images
      const imageEntities = images.map((img, index) =>
        this.productImageRepo.create({ ...img, product, sortOrder: index }),
      );
      await this.productImageRepo.save(imageEntities); // Save new images
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
    if (hasOrders > 0)
      throw new BadRequestException('Cannot delete product with active orders');
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

      // 3) Delete objects best-effort (do not block product deletion on failures)
      for (const key of Array.from(keys)) {
        await this.doSpaces.deleteObject(key).catch(() => {});
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
    return this.findOne(id);
  }

  async toggleFeatureStatus(id: number, featured: boolean): Promise<Product> {
    await this.productRepo.update(id, { featured });
    return this.findOne(id);
  }

  async suggestNames(query: string, limit = 8): Promise<{ name: string }[]> {
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
                 (COALESCE(p.sales_count, 0) * 3 + COALESCE(p."view_count", 0))::bigint AS popularity,
                 p."createdAt" AS created_at
          FROM "product" p
          WHERE p.status = 'publish' AND p."isBlocked" = false AND p.name ILIKE $2
          LIMIT ${prePrefix}
        )
        UNION ALL
        (
          SELECT p.name AS name,
                 LOWER(p.name) AS lower_name,
                 0 AS prefix_boost,
                 CASE WHEN $1 = 1 AND p."categoryId" = ANY($4::int[]) THEN 1 ELSE 0 END AS property_boost,
                 (COALESCE(p.sales_count, 0) * 3 + COALESCE(p."view_count", 0))::bigint AS popularity,
                 p."createdAt" AS created_at
          FROM "product" p
          WHERE p.status = 'publish' AND p."isBlocked" = false AND p.name ILIKE $3
          LIMIT ${preContain}
        )
      )
      SELECT DISTINCT ON (lower_name) name
      FROM candidates
      ORDER BY lower_name, prefix_boost DESC, property_boost DESC, popularity DESC, created_at DESC
      LIMIT ${lim}
    `;

    const rows: Array<{ name: string }> = await this.productRepo.query(sql, [
      hasProp,
      `${q}%`,
      `%${q}%`,
      propIds.length ? propIds : [0],
    ]);

    const seen = new Set<string>();
    const out: { name: string }[] = [];
    for (const r of rows) {
      const name = (r?.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name });
      if (out.length >= lim) break;
    }
    return out;
  }
}
