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
import { Tag } from '../tags/tag.entity';
import { ProductImpression } from './entities/product-impression.entity';
import { SearchKeyword } from './entities/search-keyword.entity';
import { createHash } from 'crypto';
import { normalizeProductMedia } from '../common/utils/media-url.util';
// import { assertAllowedMediaUrl } from '../common/utils/media-policy.util';
import { DoSpacesService } from '../media/do-spaces.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(ProductImage)
    private productImageRepo: Repository<ProductImage>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Tag) private tagRepo: Repository<Tag>,
    @InjectRepository(Category)
    private categoryRepo: TreeRepository<Category>,
    @InjectRepository(ProductImpression)
    private impressionRepo: Repository<ProductImpression>,
    @InjectRepository(SearchKeyword)
    private searchKeywordRepo: Repository<SearchKeyword>,
  private readonly doSpaces: DoSpacesService,
  private readonly audit: AuditService,
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
      ...rest
    } = data;

    const vendor = await this.userRepo.findOneBy({ id: vendorId });
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
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
      return normalizeProductMedia(product);
    } catch {
      return product;
    }
  }

  // Free digital download: presign attachment if product is marked free and has a downloadKey
  async getFreeDownload(
    productId: number,
    opts?: { ttl?: number; actorId?: number | null },
  ): Promise<{ url: string; expiresIn: number; filename?: string; contentType?: string }>{
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    const attrs = (product.attributes && typeof product.attributes === 'object') ? (product.attributes as Record<string, any>) : {};
    const isFree = attrs.isFree === true || attrs.is_free === true;
    const downloadKey: string | undefined = typeof attrs.downloadKey === 'string' ? attrs.downloadKey : undefined;
    if (!isFree) throw new BadRequestException('This item is not marked as free');
    if (!downloadKey) throw new BadRequestException('No digital download available');

    // Basic rate-limit: 20 per day per product (unauth users will have null actorId)
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const count = await this.audit.countForTargetSince('FREE_PRODUCT_DOWNLOAD', productId, from);
    if (count >= 500) {
      // broader cap to protect origin for viral freebies
      throw new BadRequestException('Download limit reached. Please try later.');
    }

    const fileName = downloadKey.split('/').pop();
    const ext = (fileName?.split('.').pop() || '').toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf' : ext === 'epub' ? 'application/epub+zip' : ext === 'zip' ? 'application/zip' : undefined;
    const ttlSecs = Math.max(60, Math.min(Number(opts?.ttl || 600), 3600));
    const url = await this.doSpaces.getDownloadSignedUrl(downloadKey, ttlSecs, { contentType, filename: fileName });

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
      const existing = await this.searchKeywordRepo.findOne({
        where: { qNorm },
      });
      if (existing) {
        existing.totalCount = (existing.totalCount || 0) + 1;
        if (kind === 'suggest')
          existing.suggestCount = (existing.suggestCount || 0) + 1;
        if (kind === 'submit')
          existing.submitCount = (existing.submitCount || 0) + 1;
        if (meta?.results !== undefined) existing.lastResults = meta.results;
        if (meta?.ip) existing.lastIp = meta.ip.slice(0, 64);
        if (meta?.ua) existing.lastUa = meta.ua.slice(0, 256);
        if (meta?.city) existing.lastCity = meta.city.slice(0, 128);
        if (meta?.vendorName)
          existing.lastVendorName = meta.vendorName.slice(0, 256);
        if (meta?.country)
          existing.lastCountry = meta.country.slice(0, 2).toUpperCase();
        if (meta?.vendorHits)
          (existing as any).vendorHits = Array.isArray(meta.vendorHits)
            ? meta.vendorHits
            : null;
        await this.searchKeywordRepo.save(existing);
      } else {
        const row = this.searchKeywordRepo.create({
          q: q.slice(0, 256),
          qNorm,
          totalCount: 1,
          suggestCount: kind === 'suggest' ? 1 : 0,
          submitCount: kind === 'submit' ? 1 : 0,
          lastResults: meta?.results ?? null,
          lastIp: meta?.ip?.slice(0, 64) || null,
          lastUa: meta?.ua?.slice(0, 256) || null,
          lastCity: meta?.city ? meta.city.slice(0, 128) : null,
          lastVendorName: meta?.vendorName
            ? meta.vendorName.slice(0, 256)
            : null,
          lastCountry: meta?.country
            ? meta.country.slice(0, 2).toUpperCase()
            : null,
          vendorHits:
            meta?.vendorHits && Array.isArray(meta.vendorHits)
              ? meta.vendorHits
              : null,
        });
        await this.searchKeywordRepo.save(row);
      }
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
    } = filters as any;
    const categoryId = rawCategoryId || categoryAlias;

    // Clamp perPage to protect backend
    const perPage = Math.min(Math.max(Number(rawPerPage) || 20, 1), 50);

    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.category', 'category');

    // Select all columns from vendor to ensure verification status is available
    qb.addSelect('vendor.*');

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
        'product.attributes',
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

    // Only show published and not blocked products
    qb.andWhere('product.status = :status', { status: 'publish' }).andWhere(
      'product.isBlocked = false',
    );

    if (search)
      qb.andWhere('product.name ILIKE :search', { search: `%${search}%` });
    if (categorySlug)
      qb.andWhere('category.slug = :categorySlug', { categorySlug });
    else if (categoryId && !includeDescendants && !categoryFirst)
      qb.andWhere('category.id = :categoryId', { categoryId });
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
    const rawLt = (listing_type ?? listingType);
    const ltNorm = typeof rawLt === 'string' ? rawLt.trim().toLowerCase() : undefined;
    const listingTypeMode = (filters as any).listingTypeMode || (filters as any).listing_type_mode;
    const ltValid = ltNorm && (ltNorm === 'sale' || ltNorm === 'rent') ? ltNorm : undefined;
    if (ltValid) {
      if (listingTypeMode === 'priority') {
        // Priority mode: do NOT filter, but rank matching listing_type highest
        qb.addSelect(`CASE WHEN product.listing_type = :lt THEN 1 ELSE 0 END`, 'lt_priority_rank');
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

    // Property city filter (from userCity or listing_city alias)
    const listingCityFilter =
      (filters as any).listing_city || (filters as any).userCity;
    if (listingCityFilter)
      qb.andWhere('LOWER(product.listing_city) = LOWER(:lc)', {
        lc: listingCityFilter,
      });

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
    // If geoPriority mode is enabled, we DO NOT hard filter; we rank by proximity of vendor profile fields to user provided geo.
    // Otherwise, we apply strict filters if supplied.
    let addedGeoRank = false;
    if (geoPriority) {
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
        WHEN (:uci <> '' AND LOWER(vendor."registrationCity") = LOWER(:uci)) THEN 4
        WHEN (:ur <> '' AND LOWER(vendor."registrationRegion") = LOWER(:ur)) THEN 3
        WHEN (:uc <> '' AND LOWER(vendor."registrationCountry") = LOWER(:uc)) THEN 2
        WHEN UPPER(COALESCE(vendor."registrationCountry", '')) IN (${eastAfricaSqlList}) THEN 1
        ELSE 0 END`;
      qb.addSelect(geoRankExpr, 'geo_rank').setParameters({
        uci,
        ur,
        uc,
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
    if ((includeDescendants || categoryFirst) && (categoryId || categorySlug)) {
      // Resolve base category id via slug if needed
      const baseCategoryId =
        categoryId ||
        (categorySlug
          ? (await this.categoryRepo.findOne({ where: { slug: categorySlug } }))
              ?.id
          : undefined);
      if (baseCategoryId) {
        // Using closure table categories_category_closure table name pattern
        // TypeORM default: category_closure (root/ancestor/descendant); but we’ll use repository to get descendants ids
        const cat = await this.categoryRepo.findOne({
          where: { id: baseCategoryId },
        });
        if (cat) {
          const descs = await this.categoryRepo.findDescendants(cat);
          const ids = Array.from(new Set(descs.map((c: any) => c.id)));
          subtreeIds = ids;
          if (ids.length && !categoryFirst) {
            qb.andWhere('category.id IN (:...catIds)', { catIds: ids });
          }
        }
      }
    }

    // Sorting options
    // Default: newest first
    if (!sort || sort === 'created_desc' || sort === '') {
      if (addedGeoRank) qb.orderBy('geo_rank', 'DESC');
      qb.addOrderBy('product.createdAt', 'DESC');
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

        const rawLtLocal = (listing_type ?? listingType);
        const ltNormLocal = typeof rawLtLocal === 'string' ? rawLtLocal.trim().toLowerCase() : undefined;
        const ltValidLocal = ltNormLocal && (ltNormLocal === 'sale' || ltNormLocal === 'rent') ? ltNormLocal : undefined;
        if (ltValidLocal) {
          if (listingTypeMode === 'priority') {
            q.addSelect(`CASE WHEN product.listing_type = :ltLocal THEN 1 ELSE 0 END`, 'lt_priority_rank');
            q.addOrderBy('lt_priority_rank', 'DESC');
          } else {
            q.andWhere('product.listing_type = :ltLocal', { ltLocal: ltValidLocal });
            this.logger.debug(`Applied listingType filter (categoryFirst branch): ${ltValidLocal}`);
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

        const listingCityFilterLocal =
          (filters as any).listing_city || (filters as any).userCity;
        if (listingCityFilterLocal)
          q.andWhere('LOWER(product.listing_city) = LOWER(:lcLocal)', {
            lcLocal: listingCityFilterLocal,
          });

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
        WHEN (:uci_local <> '' AND LOWER(vendor."registrationCity") = LOWER(:uci_local)) THEN 4
        WHEN (:ur_local <> '' AND LOWER(vendor."registrationRegion") = LOWER(:ur_local)) THEN 3
        WHEN (:uc_local <> '' AND LOWER(vendor."registrationCountry") = LOWER(:uc_local)) THEN 2
        WHEN UPPER(COALESCE(vendor."registrationCountry", '')) IN (${eastAfricaSqlList}) THEN 1
        ELSE 0 END`;
          q.addSelect(geoRankExpr, 'geo_rank').setParameters({
            uci_local: uci,
            ur_local: ur,
            uc_local: uc,
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

        // Sorting
        if (!sort || sort === 'created_desc' || sort === '') {
          if (addedGeoRankLocal) q.orderBy('geo_rank', 'DESC');
          q.addOrderBy('product.createdAt', 'DESC');
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

      const perPage = Math.min(Math.max(Number(rawPerPage) || 20, 1), 50);
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
          this.logger.debug(`(categoryFirst) primary SQL => ${primaryQb.getSql()}`);
          this.logger.debug(`(categoryFirst) others SQL => ${othersQb.getSql()}`);
        } catch {}
      }
      return {
        items,
        total,
        perPage,
        currentPage: page,
        totalPages: Math.ceil(total / perPage),
        meta: { union: { primaryTotal, othersTotal, geoAppended } },
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
      items,
      total,
      perPage,
      currentPage: page,
      totalPages: Math.ceil(total / perPage),
    };
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
    user: Pick<User, 'id'>,
  ): Promise<{ deleted: boolean }> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['vendor'],
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.vendor.id !== user.id)
      throw new ForbiddenException('You can only delete your own products');
    const hasOrders = await this.orderRepo.count({
      where: { items: { product: { id } } },
    });
    if (hasOrders > 0)
      throw new BadRequestException('Cannot delete product with active orders');
    await this.productRepo.delete(id);
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
