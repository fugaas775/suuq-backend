import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
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
import {
  normalizeDigitalAttributes,
  validateDigitalStructure,
  mapDigitalError,
} from '../common/utils/digital.util';
import { Logger } from '@nestjs/common';
import { CurrencyService } from '../common/services/currency.service';
import { ShippingService } from '../shipping/shipping.service';
import { GenerateLabelDto } from './dto/generate-label.dto';

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
    private readonly currencyService: CurrencyService,
    private readonly shippingService: ShippingService,
  ) {}

  private readonly logger = new Logger(VendorService.name);
  private readonly supportedCurrencies = ['ETB', 'SOS', 'KES', 'DJF', 'USD'];

  private normalizeCurrency(value?: string | null): string {
    const upper = (value || '').trim().toUpperCase();
    return this.supportedCurrencies.includes(upper) ? upper : 'ETB';
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
    (product as any).price_display = {
      amount: priceConverted ?? product.price ?? null,
      currency: target,
      convertedFrom: from,
      rate,
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
  ): Promise<Product> {
    const vendor = await this.userRepository.findOneBy({ id: userId });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${userId} not found.`);
    }

    // Enforce verification before allowing product creation
    const isApproved =
      vendor.verified === true ||
      vendor.verificationStatus === VerificationStatus.APPROVED;
    if (!isApproved) {
      // Use 422 for pending/rejected detail, else 403 as a strict default
      if (
        vendor.verificationStatus === VerificationStatus.PENDING ||
        vendor.verificationStatus === VerificationStatus.REJECTED ||
        vendor.verificationStatus === VerificationStatus.SUSPENDED ||
        vendor.verificationStatus === VerificationStatus.UNVERIFIED
      ) {
        throw new UnprocessableEntityException({
          error: 'Vendor is not verified to create products',
          status: vendor.verificationStatus,
          code: 'VENDOR_NOT_VERIFIED',
        });
      }
      throw new ForbiddenException('Vendor is not verified to create products');
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
      ...productData
    } = dto as any;

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
      try {
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
        this.logger.debug(
          'Normalize digital attributes (create) skipped',
          err as Error,
        );
      }
    }

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
      productType:
        productData.productType ||
        (resolvedListingType ? 'property' : undefined),
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
      ...productData
    } = dto as any;

    // Update simple fields (exclude computed getters like posterUrl/videoUrl)
    if (productData && typeof productData === 'object') {
      // Extra safety: drop any computed keys if present
      if ('posterUrl' in productData) delete productData.posterUrl;
      if ('videoUrl' in productData) delete productData.videoUrl;
    }
    Object.assign(product, productData);

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

    if (typeof attributes !== 'undefined') {
      const existing =
        product.attributes && typeof product.attributes === 'object'
          ? { ...(product.attributes as any) }
          : {};
      const next =
        attributes && typeof attributes === 'object'
          ? { ...existing, ...attributes }
          : existing;
      product.attributes = Object.keys(next).length ? next : null;
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

    // Normalize & validate digital schema after merges (update path)
    if (product.attributes && typeof product.attributes === 'object') {
      try {
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
        this.logger.debug(
          'Normalize digital attributes (update) skipped',
          err as Error,
        );
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
  async getVendorProducts(userId: number, currency?: string) {
    const target = this.normalizeCurrency(currency);
    this.logger.debug(
      `Vendor products currency normalized: requested=${currency} applied=${target}`,
    );
    // Eagerly load product relations
    const products = await this.productRepository.find({
      where: { vendor: { id: userId } },
      relations: ['images', 'category', 'tags'],
    });
    try {
      const normalized = Array.isArray(products)
        ? products.map(normalizeProductMedia)
        : [];
      return this.applyCurrencyToProducts(normalized, target);
    } catch {
      return this.applyCurrencyToProducts(
        Array.isArray(products) ? products : [],
        target,
      );
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
    items = this.applyCurrencyToProducts(items, targetCurrency);
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
      .createQueryBuilder('user')
      .where(':role = ANY(user.roles)', { role: UserRole.DELIVERER })
      .andWhere('user.isActive = true')
      .orderBy('user.displayName', 'ASC');

    if (q) {
      qb.andWhere(
        '(user.displayName ILIKE :q OR user.email ILIKE :q OR user."phoneNumber" ILIKE :q)',
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
    this.logger.debug(
      `Vendor orders currency normalized: requested=${opts.currency} applied=${targetCurrency}`,
    );

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
