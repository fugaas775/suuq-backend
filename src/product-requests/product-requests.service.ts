/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, prettier/prettier */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsRelations, In, Repository, Brackets } from 'typeorm';
import {
  ProductRequest,
  ProductRequestCondition,
  ProductRequestStatus,
  ProductRequestUrgency,
} from './entities/product-request.entity';
import {
  ProductRequestOffer,
  ProductRequestOfferStatus,
} from './entities/product-request-offer.entity';
import { ProductRequestForward } from './entities/product-request-forward.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { CreateProductRequestDto } from './dto/create-product-request.dto';
import { CreateProductRequestOfferDto } from './dto/create-product-request-offer.dto';
import { ListProductRequestQueryDto } from './dto/list-product-request-query.dto';
import { ListProductRequestFeedDto } from './dto/list-product-request-feed.dto';
import { RespondOfferDto } from './dto/respond-offer.dto';
import { Category } from '../categories/entities/category.entity';
import { Product } from '../products/entities/product.entity';
import {
  User,
  VerificationMethod,
  VerificationStatus,
} from '../users/entities/user.entity';
import { UpdateProductRequestStatusDto } from './dto/update-product-request-status.dto';
import { UserRole } from '../auth/roles.enum';
import { AppRole } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class ProductRequestsService {
  constructor(
    @InjectRepository(ProductRequest)
    private readonly requestRepo: Repository<ProductRequest>,
    @InjectRepository(ProductRequestOffer)
    private readonly offerRepo: Repository<ProductRequestOffer>,
    @InjectRepository(ProductRequestForward)
    private readonly forwardRepo: Repository<ProductRequestForward>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  private sanitizeMetadata(
    payload?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!payload || typeof payload !== 'object') return null;
    try {
      return JSON.parse(JSON.stringify(payload));
    } catch {
      return null;
    }
  }

  private normalizeCurrency(
    provided?: string | null,
    fallbacks: Array<string | null | undefined> = [],
  ): string | null {
    const candidates = [provided, ...fallbacks];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const value = candidate.trim().toUpperCase();
      if (/^[A-Z]{3}$/.test(value)) return value;
    }
    return null;
  }

  async createRequest(
    buyerId: number,
    dto: CreateProductRequestDto,
  ): Promise<ProductRequest> {
    if (typeof dto.budgetMin === 'number' && dto.budgetMin < 0) {
      throw new BadRequestException('budgetMin cannot be negative');
    }
    if (typeof dto.budgetMax === 'number' && dto.budgetMax < 0) {
      throw new BadRequestException('budgetMax cannot be negative');
    }
    if (
      typeof dto.budgetMin === 'number' &&
      typeof dto.budgetMax === 'number' &&
      dto.budgetMin > dto.budgetMax
    ) {
      throw new BadRequestException(
        'budgetMax must be greater than or equal to budgetMin',
      );
    }

    const user = await this.userRepo.findOne({ where: { id: buyerId } });
    if (!user) {
      throw new NotFoundException('Buyer not found');
    }

    let category: Category | null = null;
    if (dto.categoryId) {
      category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    // Prefer nested location when provided, else fall back to existing fields or user defaults.
    const locationCity = dto.location?.city?.trim?.() || dto.preferredCity;
    const locationCountryOrRegion =
      dto.location?.country?.trim?.() || dto.location?.region?.trim?.();
    const normalizedCountry =
      typeof locationCountryOrRegion === 'string' &&
      locationCountryOrRegion.length === 2
        ? locationCountryOrRegion.toUpperCase()
        : dto.preferredCountry?.toUpperCase?.();

    // Carry through the raw location into metadata for detail views/debugging.
    const baseMetadata = this.sanitizeMetadata(dto.metadata) ?? {};
    const metadataWithLocation = dto.location
      ? { ...baseMetadata, location: { ...dto.location } }
      : baseMetadata;

    const request = this.requestRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      buyer: { id: buyerId } as User,
      buyerId,
      category: category ?? undefined,
      categoryId: category?.id ?? null,
      budgetMin:
        typeof dto.budgetMin === 'number'
          ? Number(dto.budgetMin.toFixed(2))
          : null,
      budgetMax:
        typeof dto.budgetMax === 'number'
          ? Number(dto.budgetMax.toFixed(2))
          : null,
      currency: this.normalizeCurrency(dto.currency, [user.currency]),
      condition: dto.condition ?? ProductRequestCondition.ANY,
      urgency: dto.urgency ?? ProductRequestUrgency.FLEXIBLE,
      preferredCity: locationCity ?? user.registrationCity ?? null,
      preferredCountry:
        normalizedCountry ?? user.registrationCountry?.toUpperCase() ?? null,
      imageUrl: dto.imageUrl || null,
      status: ProductRequestStatus.OPEN,
      expiresAt: dto.expiresAt ?? null,
      metadata: metadataWithLocation,
    });

    const saved = await this.requestRepo.save(request);

    // Notify super admins that a new product request was created.
    this.notifySuperAdminsOnCreate(saved).catch(() => undefined);

    if (user.email) {
      this.emailService.sendProductRequestCreated(user, saved).catch(() => {});
    }

    return this.findRequestForBuyer(buyerId, saved.id, { includeOffers: true });
  }

  /** Create a product request on behalf of a guest (unauthenticated) user. */
  async createGuestRequest(
    dto: CreateProductRequestDto,
  ): Promise<ProductRequest> {
    const guestEmail = dto.guestEmail?.trim();
    const guestPhone = dto.guestPhone?.trim();
    const guestName = dto.guestName?.trim() || 'Guest';

    if (!guestEmail && !guestPhone) {
      throw new BadRequestException(
        'Please provide at least an email or phone number so we can reach you.',
      );
    }

    const buyer = await this.ensureGuestUser({
      guestEmail,
      guestPhone,
      guestName,
    });

    const metadata =
      dto.metadata && typeof dto.metadata === 'object'
        ? { ...dto.metadata }
        : {};
    metadata.guestContact = {
      name: guestName,
      email: guestEmail,
      phone: guestPhone,
    };

    return this.createRequest(buyer.id, {
      ...dto,
      metadata,
    } as CreateProductRequestDto);
  }

  private async ensureGuestUser(opts: {
    guestEmail?: string | null;
    guestPhone?: string | null;
    guestName?: string | null;
  }): Promise<User> {
    const email = opts.guestEmail || null;
    const phone = opts.guestPhone || null;
    const name = opts.guestName || 'Guest';

    if (email) {
      const existing = await this.userRepo.findOne({ where: { email } });
      if (existing) return existing;
    }

    const generatedEmail =
      email ||
      `guest+${Date.now()}-${Math.round(Math.random() * 1_000_000)}@guest.suuq`; // ensure unique email

    const guest = this.userRepo.create({
      email: generatedEmail,
      displayName: name,
      phoneNumber: phone || undefined,
      roles: [UserRole.CUSTOMER],
      isActive: true,
      verificationStatus: VerificationStatus.UNVERIFIED,
      verificationMethod: VerificationMethod.NONE,
      verified: false,
    });

    return this.userRepo.save(guest);
  }

  private async notifySuperAdminsOnCreate(request: ProductRequest) {
    const admins = await this.userRepo
      .createQueryBuilder('user')
      .where('user.roles @> :roles', { roles: [UserRole.SUPER_ADMIN] })
      .getMany();
    if (!admins.length) return;
    const title = 'New product request';
    const body = request.title ? request.title : 'A buyer submitted a request';
    for (const admin of admins) {
      if (!admin.id) continue;
      await this.notifications.createAndDispatch({
        userId: admin.id,
        title,
        body,
        type: NotificationType.PRODUCT_REQUEST,
        data: {
          requestId: String(request.id),
          route: `/request-detail?id=${request.id}`,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      });
    }
  }

  async findOne(id: number): Promise<ProductRequest> {
    const request = await this.requestRepo.findOne({
      where: { id },
      relations: ['category', 'acceptedOffer', 'acceptedOffer.product'],
    });

    if (!request) {
      throw new NotFoundException('Product request not found');
    }

    // Load offer count for public view
    request.offerCount = await this.offerRepo.count({
      where: { requestId: id, status: ProductRequestOfferStatus.SENT },
    });

    return request;
  }

  async findRequestForBuyer(
    buyerId: number,
    requestId: number,
    options: { includeOffers?: boolean } = {},
  ): Promise<ProductRequest> {
    const relations: FindOptionsRelations<ProductRequest> = {
      category: true,
      acceptedOffer: true,
      ...(options.includeOffers
        ? { offers: { seller: true, product: { category: true } } }
        : {}),
    } as any;

    const request = await this.requestRepo.findOne({
      where: { id: requestId, buyerId },
      relations,
    });
    if (!request) {
      throw new NotFoundException('Product request not found');
    }
    if (!options.includeOffers) {
      request.offerCount = await this.offerRepo.count({ where: { requestId } });
    } else {
      request.offerCount = request.offers?.length ?? 0;
    }
    return request;
  }

  async getForwardDetails(requestId: number, vendorId: number) {
    return this.forwardRepo.findOne({
      where: { requestId, vendorId },
      select: ['note', 'forwardedAt'],
    });
  }

  async listBuyerRequests(
    buyerId: number,
    query: ListProductRequestQueryDto,
  ): Promise<ProductRequest[]> {
    const qb = this.requestRepo
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.category', 'category')
      .leftJoinAndSelect('request.acceptedOffer', 'acceptedOffer')
      .leftJoinAndSelect('acceptedOffer.product', 'acceptedOfferProduct')
      .where('request.buyer_id = :buyerId', { buyerId })
      .orderBy('request.createdAt', 'DESC')
      .take(query.limit ?? 20);

    if (query.status) {
      qb.andWhere('request.status = :status', { status: query.status });
    }

    if (query.includeOffers) {
      qb.leftJoinAndSelect('request.offers', 'offers');
      qb.leftJoinAndSelect('offers.seller', 'offerSeller');
      qb.leftJoinAndSelect('offers.product', 'offerProduct');
    } else {
      qb.loadRelationCountAndMap('request.offerCount', 'request.offers');
    }

    const requests = await qb.getMany();
    if (query.includeOffers) {
      requests.forEach((r) => {
        r.offerCount = r.offers?.length ?? 0;
      });
    }

    return requests;
  }

  async delete(id: number): Promise<void> {
    const result = await this.requestRepo.softDelete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Product request with ID ${id} not found`);
    }
  }

  async deleteBatch(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await this.requestRepo.softDelete(ids);
  }

  async updateStatusAsBuyer(
    buyerId: number,
    requestId: number,
    dto: UpdateProductRequestStatusDto,
  ): Promise<ProductRequest> {
    if (
      ![
        ProductRequestStatus.CANCELLED,
        ProductRequestStatus.FULFILLED,
      ].includes(dto.status)
    ) {
      throw new BadRequestException('Status update not allowed');
    }

    return this.requestRepo.manager.transaction(async (em) => {
      const request = await em.findOne(ProductRequest, {
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request || request.buyerId !== buyerId) {
        throw new NotFoundException('Product request not found');
      }

      if (
        request.status === ProductRequestStatus.CANCELLED ||
        request.status === ProductRequestStatus.FULFILLED
      ) {
        return this.findRequestForBuyer(buyerId, requestId, {
          includeOffers: true,
        });
      }

      request.status = dto.status;
      request.closedAt = dto.closedAt ?? new Date();
      if (dto.status === ProductRequestStatus.CANCELLED) {
        request.acceptedOfferId = null;
        await em
          .createQueryBuilder()
          .update(ProductRequestOffer)
          .set({
            status: ProductRequestOfferStatus.REJECTED,
            respondedAt: () => 'COALESCE(responded_at, now())',
          })
          .where('request_id = :requestId AND status IN (:...statuses)', {
            requestId,
            statuses: [
              ProductRequestOfferStatus.SENT,
              ProductRequestOfferStatus.SEEN,
            ],
          })
          .execute();
      }
      if (dto.note) {
        const metadata = {
          ...(request.metadata && typeof request.metadata === 'object'
            ? request.metadata
            : {}),
          lastBuyerNote: dto.note,
        } as Record<string, unknown>;
        request.metadata = metadata;
      }

      await em.save(request);
      return this.findRequestForBuyer(buyerId, requestId, {
        includeOffers: true,
      });
    });
  }

  async listSellerFeed(
    sellerId: number,
    sellerRoles: AppRole[],
    query: ListProductRequestFeedDto,
  ): Promise<ProductRequest[]> {
    // Market Feed is removed. Focus solely on forwarded requests.
    return [];
  }

  async listForwardedToSeller(
    sellerId: number,
    sellerRoles: AppRole[],
    query: ListProductRequestFeedDto,
  ): Promise<{
    items: Array<Record<string, any>>;
    total: number;
    page: number;
    limit: number;
  }> {
    if (
      !sellerRoles?.some((role) =>
        [UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(
          role as UserRole,
        ),
      )
    ) {
      throw new ForbiddenException('Vendor role required');
    }
    const limit = query.limit ?? 20;
    const page = Math.max(query.page ?? 1, 1);
    const offset = (page - 1) * limit;
    // Latest forward per request for this seller, sorted by latest forwarded_at desc
    const latestForwardSql = `
      SELECT DISTINCT ON (f.request_id)
        f.request_id,
        f.forwarded_at,
        f.forwarded_by_admin_id
      FROM product_request_forward f
      INNER JOIN "user" u ON f.forwarded_by_admin_id = u.id
      WHERE f.vendor_id = $1
      AND u.roles::text[] @> ARRAY['SUPER_ADMIN']
      ORDER BY f.request_id ASC, f.forwarded_at DESC
    `;

    const totalRow = await this.forwardRepo.query(
      `SELECT COUNT(*) FROM (${latestForwardSql}) lf`,
      [sellerId],
    );

    const total = Number(totalRow?.[0]?.count ?? 0);

    const forwardedRows = await this.forwardRepo.query(
      `SELECT * FROM (${latestForwardSql}) lf
       ORDER BY lf.forwarded_at DESC
       OFFSET $2 LIMIT $3`,
      [sellerId, offset, limit],
    );

    const requestIds = forwardedRows
      .map((row) => Number(row.request_id))
      .filter((id) => Number.isFinite(id));

    if (!requestIds.length) {
      return { items: [], total, page, limit };
    }

    const qb = this.requestRepo
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.category', 'category')
      .leftJoinAndSelect('request.acceptedOffer', 'acceptedOffer')
      .leftJoinAndSelect('acceptedOffer.product', 'acceptedProduct')
      .where('request.id IN (:...ids)', { ids: requestIds });

    // Show everything that was forwarded, unless caller explicitly filters by status
    if (query.status) {
      const statuses = Array.isArray(query.status)
        ? query.status
        : String(query.status)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
      if (statuses.length) {
        qb.andWhere('request.status IN (:...statuses)', { statuses });
      }
    }

    if (query.categoryIds?.length) {
      qb.andWhere('request.category_id IN (:...categoryIds)', {
        categoryIds: query.categoryIds,
      });
    }

    if (query.country) {
      qb.andWhere('request.preferred_country = :country', {
        country: query.country.toUpperCase(),
      });
    }

    if (query.city) {
      qb.andWhere('request.preferred_city ILIKE :city', {
        city: `${query.city}%`,
      });
    }

    if (query.currency) {
      qb.andWhere('request.currency = :currency', {
        currency: query.currency,
      });
    }

    // Preserve global ordering by forwarded_at desc
    const orderedIds = forwardedRows.map((row) => Number(row.request_id));
    qb.orderBy(`array_position(ARRAY[${orderedIds.join(',')}], request.id)`);
    qb.loadRelationCountAndMap('request.offerCount', 'request.offers');

    const requests = await qb.getMany();

    const forwardedByIds = forwardedRows
      .map((row) => Number(row.forwarded_by_admin_id))
      .filter((id) => Number.isFinite(id));

    const forwardedByUsers = forwardedByIds.length
      ? await this.userRepo.findBy({ id: In(forwardedByIds) })
      : [];
    const forwardedByMap = new Map<number, User>();
    for (const user of forwardedByUsers) {
      if (user.id) forwardedByMap.set(user.id, user);
    }

    const forwardedMetaMap = new Map<
      number,
      { forwardedAt: Date | null; forwardedByAdminId: number | null }
    >();
    for (const row of forwardedRows) {
      const reqId = Number(row.request_id);
      if (!Number.isFinite(reqId)) continue;
      forwardedMetaMap.set(reqId, {
        forwardedAt: row.forwarded_at ?? null,
        forwardedByAdminId: Number.isFinite(Number(row.forwarded_by_admin_id))
          ? Number(row.forwarded_by_admin_id)
          : null,
      });
    }

    const items = requests.map((request) => {
      const meta = forwardedMetaMap.get(request.id) || {
        forwardedAt: null,
        forwardedByAdminId: null,
      };
      const forwardedByUser = meta.forwardedByAdminId
        ? forwardedByMap.get(meta.forwardedByAdminId)
        : undefined;

      const displayName =
        forwardedByUser?.displayName ||
        forwardedByUser?.storeName ||
        (forwardedByUser?.roles?.includes(UserRole.SUPER_ADMIN)
          ? 'Super Admin'
          : undefined) ||
        (forwardedByUser?.email ?? 'Super Admin');

      return {
        ...request,
        lastForwardedAt: meta.forwardedAt,
        forwardedBy: forwardedByUser
          ? {
              id: forwardedByUser.id,
              displayName,
              roles: forwardedByUser.roles,
            }
          : meta.forwardedByAdminId
            ? {
                id: meta.forwardedByAdminId,
                displayName: 'Super Admin',
                roles: [UserRole.SUPER_ADMIN],
              }
            : null,
      };
    });

    return { items, total, page, limit };
  }

  async createOffer(
    sellerId: number,
    sellerRoles: AppRole[],
    requestId: number,
    dto: CreateProductRequestOfferDto,
  ): Promise<ProductRequestOffer> {
    if (
      !sellerRoles?.some((role) =>
        [UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(
          role as UserRole,
        ),
      )
    ) {
      throw new ForbiddenException('Vendor role required');
    }

    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['buyer'],
    });
    if (!request) {
      throw new NotFoundException('Product request not found');
    }
    if (
      ![ProductRequestStatus.OPEN, ProductRequestStatus.IN_PROGRESS].includes(
        request.status,
      )
    ) {
      throw new BadRequestException('This request is not accepting offers');
    }
    if (request.buyerId === sellerId) {
      throw new BadRequestException('You cannot respond to your own request');
    }

    const currentOfferCount = await this.offerRepo.count({
      where: {
        requestId,
        status: In([
          ProductRequestOfferStatus.SENT,
          ProductRequestOfferStatus.SEEN,
          ProductRequestOfferStatus.ACCEPTED,
        ]),
      },
    });

    if (currentOfferCount >= 10) {
      throw new BadRequestException(
        'This request has reached the maximum limit of 10 offers.',
      );
    }

    let product: Product | null = null;
    if (dto.productId) {
      product = await this.productRepo.findOne({
        where: { id: dto.productId },
        relations: ['vendor'],
      });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      if (product.vendor?.id !== sellerId) {
        throw new ForbiddenException('You can only offer products you own');
      }
    }

    const existingOffer = await this.offerRepo.findOne({
      where: {
        requestId,
        sellerId,
        status: In([
          ProductRequestOfferStatus.SENT,
          ProductRequestOfferStatus.SEEN,
        ]),
      },
    });
    if (existingOffer) {
      throw new BadRequestException(
        'You already have an active offer for this request. Update or withdraw it instead.',
      );
    }

    // Currency Safety: If request has a specific currency, enforce it.
    if (request.currency && dto.currency && dto.currency !== request.currency) {
      throw new BadRequestException(
        `Offer currency (${dto.currency}) must match the buyer's requested currency (${request.currency})`,
      );
    }

    const currency = this.normalizeCurrency(request.currency || dto.currency, [
      product?.currency,
    ]);

    const offer = this.offerRepo.create({
      request: { id: requestId } as ProductRequest,
      requestId,
      seller: { id: sellerId } as User,
      sellerId,
      product: product ?? undefined,
      productId: product?.id ?? null,
      price:
        typeof dto.price === 'number'
          ? Number(dto.price.toFixed(2))
          : (product?.price ?? null),
      currency,
      message: dto.message ?? null,
      expiresAt: dto.expiresAt ?? null,
      status: ProductRequestOfferStatus.SENT,
    });

    const saved = await this.offerRepo.save(offer);

    if (request.status === ProductRequestStatus.OPEN) {
      await this.requestRepo.update(requestId, {
        status: ProductRequestStatus.IN_PROGRESS,
      });
    }

    const offerWithRelations = await this.offerRepo.findOne({
      where: { id: saved.id },
      relations: ['product', 'seller', 'request'],
    });

    if (offerWithRelations && request.buyer && request.buyer.email) {
      this.emailService
        .sendProductRequestOfferReceived(request.buyer, offerWithRelations)
        .catch(() => {});
    }

    return offerWithRelations;
  }

  async withdrawOffer(sellerId: number, requestId: number) {
    const existingOffer = await this.offerRepo.findOne({
      where: {
        requestId,
        sellerId,
        status: In([
          ProductRequestOfferStatus.SENT,
          ProductRequestOfferStatus.SEEN,
        ]),
      },
    });

    if (!existingOffer) {
      throw new NotFoundException('No active offer found to withdraw');
    }

    existingOffer.status = ProductRequestOfferStatus.WITHDRAWN;
    return this.offerRepo.save(existingOffer);
  }

  async listOffersForBuyer(
    buyerId: number,
    requestId: number,
  ): Promise<ProductRequestOffer[]> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
    });
    if (!request || request.buyerId !== buyerId) {
      throw new NotFoundException('Product request not found');
    }
    return this.offerRepo.find({
      where: { requestId },
      relations: ['seller', 'product', 'product.category'],
      order: { createdAt: 'DESC' },
    });
  }

  async listSellerOffersForRequest(
    sellerId: number,
    requestId: number,
  ): Promise<ProductRequestOffer[]> {
    const offers = await this.offerRepo.find({
      where: { requestId, sellerId },
      relations: ['product', 'product.category'],
      order: { createdAt: 'DESC' },
    });
    if (!offers.length) {
      const exists = await this.requestRepo.findOne({
        where: { id: requestId },
      });
      if (!exists) {
        throw new NotFoundException('Product request not found');
      }
    }
    return offers;
  }

  async acceptOffer(
    buyerId: number,
    requestId: number,
    offerId: number,
    body: RespondOfferDto,
  ): Promise<ProductRequest> {
    return this.requestRepo.manager.transaction(async (em) => {
      const request = await em.findOne(ProductRequest, {
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request || request.buyerId !== buyerId) {
        throw new NotFoundException('Product request not found');
      }
      if (request.status === ProductRequestStatus.CANCELLED) {
        throw new BadRequestException('Request is already cancelled');
      }
      const offer = await em.findOne(ProductRequestOffer, {
        where: { id: offerId, requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!offer) {
        throw new NotFoundException('Offer not found');
      }

      const now = new Date();
      offer.status = ProductRequestOfferStatus.ACCEPTED;
      offer.respondedAt = now;
      await em.save(offer);

      await em
        .createQueryBuilder()
        .update(ProductRequestOffer)
        .set({
          status: ProductRequestOfferStatus.REJECTED,
          respondedAt: () => 'COALESCE(responded_at, now())',
        })
        .where(
          'request_id = :requestId AND id <> :acceptedId AND status IN (:...statuses)',
          {
            requestId,
            acceptedId: offerId,
            statuses: [
              ProductRequestOfferStatus.SENT,
              ProductRequestOfferStatus.SEEN,
            ],
          },
        )
        .execute();

      request.status = ProductRequestStatus.FULFILLED;
      request.acceptedOfferId = offer.id;
      request.closedAt = now;
      if (body?.note) {
        const metadata = {
          ...(request.metadata && typeof request.metadata === 'object'
            ? request.metadata
            : {}),
          acceptanceNote: body.note,
        } as Record<string, unknown>;
        request.metadata = metadata;
      }
      await em.save(request);

      // Notify seller
      const seller = await em.findOne(User, { where: { id: offer.sellerId } });
      if (seller && seller.email) {
        this.emailService
          .sendOfferStatusChange(seller, { ...offer, request }, 'ACCEPTED')
          .catch(() => {});
      }

      return this.findRequestForBuyer(buyerId, requestId, {
        includeOffers: true,
      });
    });
  }

  async rejectOffer(
    buyerId: number,
    requestId: number,
    offerId: number,
    body: RespondOfferDto,
  ): Promise<ProductRequestOffer> {
    const offer = await this.offerRepo.findOne({
      where: { id: offerId, requestId },
      relations: ['request'],
    });
    if (!offer || offer.request.buyerId !== buyerId) {
      throw new NotFoundException('Offer not found');
    }
    if (
      offer.status === ProductRequestOfferStatus.ACCEPTED ||
      offer.status === ProductRequestOfferStatus.REJECTED
    ) {
      return offer;
    }

    offer.status = ProductRequestOfferStatus.REJECTED;
    offer.respondedAt = new Date();
    if (body?.note) {
      offer.message = offer.message
        ? `${offer.message}\nRejected: ${body.note}`
        : `Rejected: ${body.note}`;
    }
    const saved = await this.offerRepo.save(offer);

    // Notify seller
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
    });
    const seller = await this.userRepo.findOne({
      where: { id: offer.sellerId },
    });
    if (seller && seller.email && request) {
      this.emailService
        .sendOfferStatusChange(seller, { ...offer, request }, 'REJECTED')
        .catch(() => {});
    }

    return saved;
  }

  async markOfferSeen(offerId: number, sellerId: number): Promise<void> {
    await this.offerRepo.update(
      {
        id: offerId,
        sellerId,
        status: ProductRequestOfferStatus.SENT,
      },
      {
        status: ProductRequestOfferStatus.SEEN,
        seenAt: new Date(),
      },
    );
  }
}
