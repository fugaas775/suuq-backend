import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateVendorProductDto } from './dto/create-vendor-product.dto';
import { FindAllVendorsDto } from './dto/find-all-vendors.dto';
import { UpdateVendorProductDto } from './dto/update-vendor-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Raw, ArrayContains, ILike, In } from 'typeorm';
import { User, VerificationStatus } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Category } from '../categories/entities/category.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { Order, OrderItem } from '../orders/entities/order.entity';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../orders/entities/order.entity';
import { normalizeProductMedia } from '../common/utils/media-url.util';
import { UserRole } from '../auth/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Tag } from '../tags/tag.entity';
import { DoSpacesService } from '../media/do-spaces.service';

@Injectable()
export class VendorService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
  @InjectRepository(ProductImage)
  private readonly productImageRepository: Repository<ProductImage>,
  @InjectRepository(Tag)
  private readonly tagRepository: Repository<Tag>,
    private readonly notificationsService: NotificationsService,
  private readonly doSpacesService: DoSpacesService,
  ) {}

  // ✅ FIX: This function now correctly handles an array of ImageDto objects
  async createMyProduct(
    userId: number,
    dto: CreateVendorProductDto,
  ): Promise<Product> {
    const vendor = await this.userRepository.findOneBy({ id: userId });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${userId} not found.`);
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
      attributes,
      tags,
      videoUrl,
      posterUrl,
  downloadKey,
  isFree,
      ...productData
    } = dto as any;

    // Normalize listingType if client sent listingTypeMulti
    const resolvedListingType: 'sale' | 'rent' | undefined = (() => {
      if (listingType && (listingType === 'sale' || listingType === 'rent')) return listingType;
      if (Array.isArray(listingTypeMulti) && listingTypeMulti.length) {
        const first = String(listingTypeMulti[0] || '').toLowerCase();
        if (first === 'sale' || first === 'sell') return 'sale';
        if (first === 'rent' || first === 'rental') return 'rent';
      }
      return undefined;
    })();

    const safeAttributes: Record<string, any> | undefined = (() => {
      const a: Record<string, any> = {};
      if (attributes && typeof attributes === 'object') Object.assign(a, attributes);
      // Some clients send videoUrl at top-level attributes or in dto.attributes
      if (a.videoUrl == null && dto && (dto as any).attributes?.videoUrl) {
        a.videoUrl = (dto as any).attributes.videoUrl;
      }
      // Also accept top-level dto.videoUrl
      if (a.videoUrl == null && (dto as any)?.videoUrl) a.videoUrl = (dto as any).videoUrl;
      // Poster URL handling
      if (a.posterUrl == null && dto && (dto as any).attributes?.posterUrl) {
        a.posterUrl = (dto as any).attributes.posterUrl;
      }
      if (a.posterUrl == null && (dto as any)?.posterUrl) a.posterUrl = (dto as any).posterUrl;
      // Digital product download key
      if (a.downloadKey == null && dto && (dto as any).attributes?.downloadKey) {
        a.downloadKey = (dto as any).attributes.downloadKey;
      }
      if (a.downloadKey == null && (dto as any)?.downloadKey) a.downloadKey = (dto as any).downloadKey;
      // Free flag (boolean)
      if (typeof (dto as any)?.isFree === 'boolean') a.isFree = !!(dto as any).isFree;
      if (dto && (dto as any).attributes && typeof (dto as any).attributes.isFree === 'boolean' && a.isFree == null) {
        a.isFree = !!(dto as any).attributes.isFree;
      }
      // Also accept top-level dto.attributes.videoUrl or dto.videoUrl inside dto.attributes
      return Object.keys(a).length ? a : undefined;
    })();

  const newProduct = this.productRepository.create({
      ...productData,
      vendor: vendor,
      category: categoryId ? { id: categoryId } : undefined,
      imageUrl: images && images.length > 0 ? images[0].src : null, // Set main display image
      listingType: resolvedListingType,
      listingCity,
      bedrooms,
      bathrooms,
      sizeSqm,
      furnished,
      rentPeriod,
      attributes: safeAttributes,
    });

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
        const existing = await this.tagRepository.find({ where: { name: In(tagNames) } as any });
        const existingNames = new Set(existing.map((t: any) => t.name));
        const toCreate = tagNames.filter((n) => !existingNames.has(n));
        const created = toCreate.length
          ? await this.tagRepository.save(toCreate.map((name) => this.tagRepository.create({ name })))
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
  ): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId, vendor: { id: userId } },
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
      attributes,
      tags,
      videoUrl,
      posterUrl,
  downloadKey,
  isFree,
      ...productData
    } = dto as any;

  // Update simple fields (exclude computed getters like posterUrl/videoUrl)
  if (productData && typeof productData === 'object') {
    // Extra safety: drop any computed keys if present
    if ('posterUrl' in productData) delete (productData as any).posterUrl;
    if ('videoUrl' in productData) delete (productData as any).videoUrl;
  }
  Object.assign(product, productData);

    // Merge property fields
    const resolvedListingType: 'sale' | 'rent' | undefined = (() => {
      if (listingType && (listingType === 'sale' || listingType === 'rent')) return listingType;
      if (Array.isArray(listingTypeMulti) && listingTypeMulti.length) {
        const first = String(listingTypeMulti[0] || '').toLowerCase();
        if (first === 'sale' || first === 'sell') return 'sale';
        if (first === 'rent' || first === 'rental') return 'rent';
      }
      return undefined;
    })();
    if (resolvedListingType) product.listingType = resolvedListingType;
    if (typeof listingCity !== 'undefined') product.listingCity = listingCity ?? null;
    if (typeof bedrooms !== 'undefined') product.bedrooms = bedrooms as any;
    if (typeof bathrooms !== 'undefined') product.bathrooms = bathrooms as any;
    if (typeof sizeSqm !== 'undefined') product.sizeSqm = sizeSqm as any;
    if (typeof furnished !== 'undefined') product.furnished = furnished as any;
    if (typeof rentPeriod !== 'undefined') product.rentPeriod = rentPeriod as any;

    if (typeof attributes !== 'undefined') {
      const existing = (product.attributes && typeof product.attributes === 'object') ? { ...(product.attributes as any) } : {};
      const next = attributes && typeof attributes === 'object' ? { ...existing, ...attributes } : existing;
      product.attributes = Object.keys(next).length ? next : null;
    }
    // Accept top-level dto.videoUrl during update as well
    if ((dto as any) && typeof (dto as any).videoUrl === 'string' && (dto as any).videoUrl) {
      const base = (product.attributes && typeof product.attributes === 'object') ? { ...(product.attributes as any) } : {};
      base.videoUrl = (dto as any).videoUrl;
      product.attributes = base;
    }
    // Accept top-level dto.posterUrl during update as well
    if ((dto as any) && typeof (dto as any).posterUrl === 'string' && (dto as any).posterUrl) {
      const base = (product.attributes && typeof product.attributes === 'object') ? { ...(product.attributes as any) } : {};
      base.posterUrl = (dto as any).posterUrl;
      product.attributes = base;
    }
    // Accept top-level dto.downloadKey during update as well
    if ((dto as any) && typeof (dto as any).downloadKey === 'string' && (dto as any).downloadKey) {
      const base = (product.attributes && typeof product.attributes === 'object') ? { ...(product.attributes as any) } : {};
      base.downloadKey = (dto as any).downloadKey;
      product.attributes = base;
    }
    // Accept top-level dto.isFree during update
    if ((dto as any) && typeof (dto as any).isFree === 'boolean') {
      const base = (product.attributes && typeof product.attributes === 'object') ? { ...(product.attributes as any) } : {};
      base.isFree = !!(dto as any).isFree;
      product.attributes = base;
    }

    // Update tags by names if provided
    if (Array.isArray(tags)) {
      const tagNames: string[] = tags
        .map((t: any) => (typeof t === 'string' ? t.trim() : ''))
        .filter((s: string) => !!s);
      const existing = tagNames.length
        ? await this.tagRepository.find({ where: { name: In(tagNames) } as any })
        : [];
      const existingNames = new Set(existing.map((t: any) => t.name));
      const toCreate = tagNames.filter((n) => !existingNames.has(n));
      const created = toCreate.length
        ? await this.tagRepository.save(toCreate.map((name) => this.tagRepository.create({ name })))
        : [];
      (product as any).tags = [...existing, ...created];
    }

    // Update category if it was sent
    if (categoryId !== undefined) {
      if (categoryId) {
        // Fetch the category entity from the database
        const categoryRepo =
          this.productRepository.manager.getRepository(Category);
        const category = await categoryRepo.findOne({
          where: { id: categoryId },
        });
        if (!category) {
          throw new NotFoundException(
            `Category with ID ${categoryId} not found.`,
          );
        }
        product.category = category;
      } else {
        product.category = null;
      }
    }

    // Update images if they were sent (delete old ones, add new ones)
    if (images) {
      product.imageUrl = images.length > 0 ? images[0].src : null;
      await this.productImageRepository.delete({ product: { id: productId } });

      const imageEntities = images.map((imageObj, index) =>
        this.productImageRepository.create({
          ...imageObj,
          product,
          sortOrder: index,
        }),
      );
      await this.productImageRepository.save(imageEntities);
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
    await this.productRepository.delete(productId);
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
      const out = normalizeProductMedia(product as any) as any;
      // Optional: attach a short-lived signed playback URL for the video to simplify clients
      if (opts?.playable) {
        const v: string | undefined = out.videoUrl || (out.attributes?.videoUrl as string | undefined);
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
            out.playableUrl = await this.doSpacesService.getSignedUrl(key, ttl, {
              contentType: mime,
              inlineFilename: fileName,
            });
            out.playableExpiresIn = ttl;
          }
        }
      }
      return out;
    } catch {
      return product as any;
    }
  }

  async getSalesGraphData(vendorId: number, range: string) {
    const startDate = new Date();
    const r = String(range || '').toLowerCase();
    if (r === '365d') startDate.setDate(startDate.getDate() - 365);
    else if (r === '90d') startDate.setDate(startDate.getDate() - 90);
    else if (r === '30d') startDate.setDate(startDate.getDate() - 30);
    else if (r === '7d') startDate.setDate(startDate.getDate() - 7);
    else startDate.setDate(startDate.getDate() - 30);

    const salesData = await this.orderRepository
      .createQueryBuilder('o')
      .innerJoin('o.items', 'orderItem')
      .innerJoin('orderItem.product', 'product')
      .where('product.vendorId = :vendorId', { vendorId })
      .andWhere('o.createdAt >= :startDate', { startDate })
      .select('DATE(o.createdAt)', 'date')
      .addSelect('SUM(o.total)', 'total')
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
      minSales?: number;
      minRating?: number;
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
      minSales,
      minRating,
    } = findAllVendorsDto;
    const skip = (page - 1) * limit;

    let findOptions: any;

    if (search) {
      // If there is a search term, create OR conditions for displayName and storeName
      findOptions = {
        where: [
          {
            roles: ArrayContains([UserRole.VENDOR]),
            isActive: true,
            displayName: ILike(`%${search}%`),
          },
          {
            roles: ArrayContains([UserRole.VENDOR]),
            isActive: true,
            storeName: ILike(`%${search}%`),
          },
        ],
      };
    } else {
      // If there is no search term, find all vendors
      findOptions = {
        where: {
          roles: ArrayContains([UserRole.VENDOR]),
          isActive: true,
        },
      };
    }

    const order: any = {};
    if (sort === 'name') order.displayName = 'ASC';
    else if (sort === 'verifiedAt') order.verifiedAt = 'DESC';
    else if (sort === 'popular') order.numberOfSales = 'DESC';
    else order.createdAt = 'DESC';

    // filter by verificationStatus when provided (Home uses APPROVED)
    if (verificationStatus) {
      findOptions.where = Array.isArray(findOptions.where)
        ? findOptions.where.map((w: any) => ({
            ...w,
            verificationStatus,
          }))
        : { ...findOptions.where, verificationStatus };
    }

    // Apply geo filters (case-insensitive equals) when provided
    const geoFilters: any = {};
    if (country)
      geoFilters.registrationCountry = Raw(
        (alias) => `LOWER(${alias}) = LOWER(:country)`,
        { country },
      );
    if (region)
      geoFilters.registrationRegion = Raw(
        (alias) => `LOWER(${alias}) = LOWER(:region)`,
        { region },
      );
    if (city)
      geoFilters.registrationCity = Raw(
        (alias) => `LOWER(${alias}) = LOWER(:city)`,
        { city },
      );

    if (Object.keys(geoFilters).length) {
      findOptions.where = Array.isArray(findOptions.where)
        ? findOptions.where.map((w: any) => ({ ...w, ...geoFilters }))
        : { ...findOptions.where, ...geoFilters };
    }

    // Apply minimum thresholds
    const minFilters: any = {};
    if (typeof minSales === 'number' && !Number.isNaN(minSales)) {
      minFilters.numberOfSales = Raw((alias) => `${alias} >= :minSales`, {
        minSales: Number(minSales),
      });
    }
    if (typeof minRating === 'number' && !Number.isNaN(minRating)) {
      minFilters.rating = Raw((alias) => `${alias} >= :minRating`, {
        minRating: Number(minRating),
      });
    }
    if (Object.keys(minFilters).length) {
      findOptions.where = Array.isArray(findOptions.where)
        ? findOptions.where.map((w: any) => ({ ...w, ...minFilters }))
        : { ...findOptions.where, ...minFilters };
    }

    const [users, total] = await this.userRepository.findAndCount({
      ...findOptions,
      take: limit,
      skip,
      order,
      select: [
        'id',
        'displayName',
        'storeName',
        'avatarUrl',
        'verificationStatus',
        'verified',
        'rating',
        'numberOfSales',
        'verifiedAt',
        'createdAt',
        'supportedCurrencies',
        'registrationCountry',
        'registrationCity',
      ] as any,
    });

    const items = users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      storeName: u.storeName,
      avatarUrl: u.avatarUrl,
      verificationStatus: u.verificationStatus,
      isVerified: !!u.verified,
      rating: u.rating ?? 0,
      productCount: undefined, // placeholder; can join or compute later
      certificateCount: Array.isArray((u as any).verificationDocuments)
        ? (u as any).verificationDocuments.length
        : undefined,
    }));

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
      .createQueryBuilder('user')
      .where('user.id = :id', { id: userId })
      .andWhere(':role = ANY(user.roles)', { role: UserRole.VENDOR })
      .getOne();
    if (!user) return null;
  const { id, storeName, avatarUrl, displayName, createdAt } = user as any;
  return { id, storeName, avatarUrl, displayName, createdAt };
  }

  async getDashboardOverview(userId: number) {
    const productCount = await this.productRepository.count({
      where: { vendor: { id: userId } },
    });

    const orderCount = await this.orderRepository
      .createQueryBuilder('order')
      .innerJoin('order.items', 'orderItem')
      .innerJoin('orderItem.product', 'product')
      .where('product.vendor.id = :userId', { userId })
      .getCount();

    return { productCount, orderCount };
  }
  async getVendorProducts(userId: number) {
    // Eagerly load product relations
    const products = await this.productRepository.find({
      where: { vendor: { id: userId } },
      relations: ['images', 'category', 'tags'],
    });
    try {
      return Array.isArray(products) ? products.map(normalizeProductMedia) : [];
    } catch {
      return Array.isArray(products) ? products : [];
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
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.tags', 'tags')
      .where('product.vendorId = :userId', { userId })
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
      qb.andWhere('product.name ILIKE :search', { search: `%${q.search}%` });
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
    // Mark optional reason as intentionally unused
    void _reason;
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Vendor with ID ${userId} not found.`);
    }
    // Optional: ensure user has VENDOR role
    if (!Array.isArray(user.roles) || !user.roles.includes(UserRole.VENDOR)) {
      throw new ForbiddenException('User is not a vendor.');
    }
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
    return await this.userRepository.save(user);
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
  }): Promise<{
    items: Array<{ id: number; name: string | null; email: string | null; phone: string | null }>;
    total: number;
  }> {
    const q = (opts.q || '').trim();
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 20;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .where(':role = ANY(user.roles)', { role: UserRole.DELIVERER })
      .andWhere('user.isActive = true')
      .orderBy('user.displayName', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (q) {
      qb.andWhere(
        '(user.displayName ILIKE :q OR user.email ILIKE :q OR user."phoneNumber" ILIKE :q)',
        { q: `%${q}%` },
      );
    }

    const [users, total] = await qb.getManyAndCount();
    const items = users.map((u) => ({
      id: u.id,
      name: u.displayName || null,
      email: u.email || null,
      phone: (u as any).phoneNumber || null,
    }));
    return { items, total };
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
      .createQueryBuilder('user')
      .where(':role = ANY(user.roles)', { role: UserRole.VENDOR })
      .andWhere('user.isActive = true')
      .orderBy('user.displayName', 'ASC')
      .take(Math.min(Math.max(Number(limit) || 10, 1), 50));

    const term = (q || '').trim();
    if (term) {
      qb.andWhere('(user.displayName ILIKE :q OR user.storeName ILIKE :q)', {
        q: `%${term}%`,
      });
    }

    const users = await qb.getMany();
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName || null,
      storeName: (u as any).storeName || null,
      avatarUrl: u.avatarUrl || null,
    }));
  }

  /**
   * Get paginated orders that include ONLY this vendor's products.
   * For safety, we currently restrict updates to orders that are fully owned by the vendor
   * (i.e., all items belong to this vendor). Listing shows all orders containing vendor items;
   * details and updates are validated for ownership.
   */
  async getVendorOrders(
    vendorId: number,
    opts: { page?: number; limit?: number; status?: OrderStatus },
  ): Promise<{ data: any[]; total: number }> {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 20;

    const qb = this.orderRepository
      .createQueryBuilder('o')
      .innerJoin('o.items', 'oi')
      .innerJoin('oi.product', 'p')
      .innerJoin('p.vendor', 'v')
      .leftJoinAndSelect('o.deliverer', 'deliverer')
      .leftJoinAndSelect('o.user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.vendor', 'productVendor')
      .where('v.id = :vendorId', { vendorId })
      .orderBy('o.createdAt', 'DESC')
      .distinct(true)
      .skip((page - 1) * limit)
      .take(limit);

    if (opts.status) {
      qb.andWhere('o.status = :status', { status: opts.status });
    }

    const [orders, total] = await qb.getManyAndCount();

    // Filter items to only this vendor's products in the response and expose normalized deliverer fields
    const data = orders.map((o) => {
      const d: any = (o as any).deliverer || null;
      const filteredItems = (o.items || []).filter(
        (it) => (it.product as any)?.vendor?.id === vendorId,
      );
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
        items: filteredItems,
      };
    });

    return { data, total };
  }

  async getVendorOrder(vendorId: number, orderId: number) {
    const order = await this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.deliverer', 'deliverer')
      .leftJoinAndSelect('o.user', 'user')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
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
      items: (order.items || []).filter(
        (it) => (it.product as any)?.vendor?.id === vendorId,
      ),
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
    const allFromVendor =
      items.length > 0 &&
      items.every((it) => (it.product as any)?.vendor?.id === vendorId);
    if (!allFromVendor) {
      throw new ForbiddenException(
        'Order contains items from other vendors; cannot assign deliverer',
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
    await this.orderRepository.save(order);

    // Notify deliverer
    try {
      await this.notificationsService.sendToUser({
        userId: delivererId,
        title: 'New Delivery Assigned',
        body: `You have been assigned order #${orderId}`,
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
      [OrderStatus.PENDING]: [OrderStatus.PROCESSING],
      [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED],
      [OrderStatus.SHIPPED]: [],
      [OrderStatus.OUT_FOR_DELIVERY]: [],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.DELIVERY_FAILED]: [],
      [OrderStatus.CANCELLED]: [],
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
      relations: ['product', 'product.vendor', 'order', 'order.items'],
    });
    if (!item) throw new NotFoundException('Order item not found');
    if ((item.product as any)?.vendor?.id !== vendorId) {
      throw new ForbiddenException('You cannot update this item');
    }

    const allowedNext: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.PROCESSING],
      [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED],
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
}
