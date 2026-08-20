import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { Product } from '../products/entities/product.entity';
import { BranchCatalogProductLink } from '../retail/entities/branch-catalog-product-link.entity';
import {
  SchoolClass,
  SchoolClassStatus,
} from '../school/entities/school-class.entity';
import {
  ConsumerBranchItemDto,
  ConsumerBranchListDto,
  ConsumerBranchProductItemDto,
  ConsumerBranchProductsDto,
  ConsumerBranchQrDto,
  ConsumerSchoolClassesDto,
} from './dto/consumer-response.dto';
import { ConsumerBranchQueryDto } from './dto/consumer-branch-query.dto';
import { ConsumerShelfService } from './consumer-shelf.service';
import { serviceFormatLabel } from '../common/service-formats';
import { resolveBranchPresence } from '../common/operating-hours';
import { resolveProductCatalogMetadata } from '../common/utils/media-url.util';

const toFormatLabel = serviceFormatLabel;

/** Public base URL used to build branch QR universal links. */
function publicBaseUrl(): string {
  const raw = process.env.PUBLIC_BASE_URL || 'https://suuq-s.com';
  return raw.replace(/\/+$/, '');
}

function toBranchItem(
  branch: Branch,
  store: VendorStore | null,
): ConsumerBranchItemDto {
  const owner = branch.owner ?? null;
  const presence = resolveBranchPresence(store?.operatingHours ?? null);
  return {
    branchId: branch.id,
    storeId: store?.id ?? null,
    operatingHours: store?.operatingHours ?? null,
    isOpenNow: presence.isOpenNow,
    nextOpenAt: presence.nextOpenAt,
    name: branch.name,
    serviceFormat: branch.serviceFormat ?? null,
    serviceFormatLabel: toFormatLabel(branch.serviceFormat),
    address: branch.address ?? null,
    city: branch.city ?? null,
    phone: branch.phone ?? null,
    latitude: branch.latitude != null ? Number(branch.latitude) : null,
    longitude: branch.longitude != null ? Number(branch.longitude) : null,
    isActive: branch.isActive,
    ownerId: owner?.id ?? branch.ownerId ?? null,
    ownerName: owner ? (owner.storeName ?? owner.displayName ?? null) : null,
    /**
     * The BRANCH's own logo first.
     *
     * This read predates `Branch.logoUrl` and had only one image to reach for —
     * the owner's account avatar. That is the picture a merchant chose for
     * THEMSELVES, and for anyone who signed up with Google it is their Google
     * profile photo: a school's public enrolment page was headed by a
     * photograph of a man, which a parent reads as the school. The branch has
     * carried its own brand mark since `Branch.logoUrl` shipped, and every
     * other surface — the register badge, the receipt header — already prefers
     * it (see `BranchBadge`); this was the one place still asking the owner.
     *
     * The avatar stays as the fallback rather than being dropped: plenty of
     * merchants set their account picture TO their shop's logo, it is the only
     * image those branches have, and the released consumer app reads this field
     * with no way to be told otherwise. A branch with neither shows no image,
     * which the clients already handle.
     */
    logoUrl: branch.logoUrl ?? owner?.avatarUrl ?? null,
  };
}

@Controller('consumer/v1/branches')
export class ConsumerBranchController {
  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(VendorStore)
    private readonly vendorStoreRepo: Repository<VendorStore>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(BranchCatalogProductLink)
    private readonly catalogLinkRepo: Repository<BranchCatalogProductLink>,
    // The registry, read directly rather than through `SchoolClassService`.
    // That service is the AUTHENTICATED registry — every one of its callers is
    // behind `PosBranchAccessGuard`, and importing `SchoolModule` here to reach
    // it would pull `RetailModule` and two guards into the one module that is
    // deliberately guardless. Reading three columns is the smaller thing.
    @InjectRepository(SchoolClass)
    private readonly schoolClassRepo: Repository<SchoolClass>,
    private readonly shelf: ConsumerShelfService,
  ) {}

  /**
   * Maps branchId → its consumer storefront.
   *
   * Resolved from the `vendor_stores` side using the same predicate as the
   * listing filter, so the store we hand out is always the one the shopper can
   * actually reach. Reading `branch.vendorStoreId` instead would trust the other
   * half of an unenforced 1:1 and can drift — see
   * `scripts/reconcile-branch-vendor-store-links.ts`.
   *
   * The storefront also carries the published hours, which is what makes
   * "open now" answerable.
   */
  private async resolveStores(
    branchIds: number[],
  ): Promise<Map<number, VendorStore>> {
    if (branchIds.length === 0) return new Map();
    const stores = await this.vendorStoreRepo.find({
      where: { branchId: In(branchIds), isConsumerVisible: true },
      select: ['id', 'branchId', 'operatingHours'],
    });
    return new Map(
      stores
        .filter(
          (s): s is VendorStore & { branchId: number } => s.branchId != null,
        )
        .map((s) => [s.branchId, s]),
    );
  }

  /**
   * GET /consumer/v1/branches
   * Discover active branches, optionally filtered by service format or text.
   */
  @Get()
  async listBranches(
    @Query() query: ConsumerBranchQueryDto,
  ): Promise<ConsumerBranchListDto> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(query.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const qb = this.branchesRepository
      .createQueryBuilder('branch')
      .leftJoinAndSelect('branch.owner', 'owner')
      .where('branch.isActive = true')
      // Only show branches that have a consumer-visible store profile
      .andWhere(
        `EXISTS (
          SELECT 1 FROM vendor_stores vs
          WHERE vs."branchId" = branch.id
          AND vs."isConsumerVisible" = true
        )`,
      );

    if (query.serviceFormat?.length) {
      qb.andWhere('branch.serviceFormat IN (:...formats)', {
        formats: query.serviceFormat,
      });
    }

    if (query.q) {
      qb.andWhere(
        '(LOWER(branch.name) LIKE :search OR LOWER(branch.city) LIKE :search OR LOWER(branch.address) LIKE :search)',
        { search: `%${query.q.toLowerCase()}%` },
      );
    }

    if (query.lat != null && query.lng != null && query.radius != null) {
      // Haversine proximity filter (radius in km)
      qb.andWhere(
        `(
          6371 * ACOS(
            COS(RADIANS(:lat)) * COS(RADIANS(CAST(branch.latitude AS DOUBLE PRECISION)))
            * COS(RADIANS(CAST(branch.longitude AS DOUBLE PRECISION)) - RADIANS(:lng))
            + SIN(RADIANS(:lat)) * SIN(RADIANS(CAST(branch.latitude AS DOUBLE PRECISION)))
          )
        ) <= :radius`,
        { lat: query.lat, lng: query.lng, radius: query.radius },
      );
    }

    // Sort by proximity when coordinates are supplied, otherwise alphabetically.
    // GREATEST/LEAST guards against floating-point ACOS domain errors on edge rows.
    if (query.lat != null && query.lng != null) {
      qb.setParameter('latSort', query.lat);
      qb.setParameter('lngSort', query.lng);
      qb.orderBy(
        `(6371 * ACOS(GREATEST(-1, LEAST(1,
          COS(RADIANS(:latSort)) * COS(RADIANS(CAST(branch.latitude AS DOUBLE PRECISION)))
          * COS(RADIANS(CAST(branch.longitude AS DOUBLE PRECISION)) - RADIANS(:lngSort))
          + SIN(RADIANS(:latSort)) * SIN(RADIANS(CAST(branch.latitude AS DOUBLE PRECISION)))
        ))))`,
        'ASC',
      );
    } else {
      qb.orderBy('branch.name', 'ASC');
    }
    qb.skip(skip).take(limit);

    const [branches, total] = await qb.getManyAndCount();
    const storeByBranch = await this.resolveStores(branches.map((b) => b.id));

    return {
      items: branches.map((b) =>
        toBranchItem(b, storeByBranch.get(b.id) ?? null),
      ),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * GET /consumer/v1/branches/:branchId
   * Returns the public profile of a single branch.
   */
  @Get(':branchId')
  async getBranch(
    @Param('branchId', ParseIntPipe) branchId: number,
  ): Promise<ConsumerBranchItemDto> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId, isActive: true },
      relations: { owner: true },
    });
    if (!branch) {
      throw new NotFoundException(`Branch ${branchId} not found`);
    }
    const storeByBranch = await this.resolveStores([branch.id]);
    return toBranchItem(branch, storeByBranch.get(branch.id) ?? null);
  }

  /**
   * GET /consumer/v1/branches/:branchId/qr
   * Returns the universal link a branch should encode in its printed QR code.
   * Scanning it deep-links into the consumer app's branch ordering screen.
   */
  @Get(':branchId/qr')
  async getBranchQr(
    @Param('branchId', ParseIntPipe) branchId: number,
  ): Promise<ConsumerBranchQrDto> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId, isActive: true },
    });
    if (!branch) {
      throw new NotFoundException(`Branch ${branchId} not found`);
    }
    return {
      branchId: branch.id,
      name: branch.name,
      url: `${publicBaseUrl()}/s/b/${branch.id}`,
    };
  }

  /**
   * GET /consumer/v1/branches/:branchId/classes
   *
   * The classes a school will take an application for, so the family can PICK
   * one instead of describing it.
   *
   * Until this existed the public form asked for the class as free text — the
   * school's classes were not published anywhere, so a parent typed "grade 5",
   * "5aad" or "the class after KG" and a clerk translated it into a real class
   * by hand on the way to enrolling the child. Every one of those spellings is
   * a chance to put a child in the wrong room, and the school already knows the
   * answer: it is sitting in `pos_school_classes`.
   *
   * ── The two things this must not do ──────────────────────────────────────
   *
   * 1. **Answer for a branch that is not a school.** The registry was seeded
   *    from `attributes.hotelRooms`, the field HOTEL, PROPERTY_RENTAL and
   *    BARBER also declare their board units in. That backfill was scoped to
   *    SCHOOL and so is this read — but a branch can change format after the
   *    fact, and publishing a hotel's room numbers to anyone holding a link is
   *    not a mistake worth leaving one condition away.
   * 2. **Publish the school's own numbers.** `capacity` and `feeProductId` stay
   *    on the server. A place is offered or refused by the office, not by
   *    arithmetic on a public page, and a family that reads "Grade 5: full"
   *    before applying has been turned down by a cache.
   * 3. **Ask a family which ROOM their child should sit in.** A school that
   *    teaches 3aad as two sections holds two class rows, and publishing both
   *    puts "3aad A" and "3aad B" in front of a parent as though the choice
   *    were theirs. It is not: which section a child joins is the office's,
   *    made against the roll on the day they are enrolled. Sections collapse to
   *    their grade here — the family picks 3aad, and the desk places them.
   *
   * Empty rather than 404 when a school has no registry: the form falls back to
   * asking the family to type it, which is exactly where it started.
   */
  // A registry changes when a school opens a class — once or twice a year. Five
  // minutes at the edge costs a family nothing and takes the read off the
  // database for every scan of the same printed poster.
  @Header('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
  @Get(':branchId/classes')
  async getBranchSchoolClasses(
    @Param('branchId', ParseIntPipe) branchId: number,
  ): Promise<ConsumerSchoolClassesDto> {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId, isActive: true },
      select: ['id', 'serviceFormat'],
    });
    if (!branch) {
      throw new NotFoundException(`Branch ${branchId} not found`);
    }
    if (String(branch.serviceFormat ?? '').toUpperCase() !== 'SCHOOL') {
      return { branchId, items: [] };
    }

    const rows = await this.schoolClassRepo.find({
      where: { branchId, status: SchoolClassStatus.ACTIVE },
      select: ['code', 'name', 'sortOrder', 'gradeCode'],
      // Teaching order first, then code — a school reads KG before Grade 1, and
      // sorting by code alone puts '10th' before '1aad' before '2aad'. Same
      // order `SchoolClassService.list` gives the office, so the family and the
      // clerk read the same list in the same sequence.
      order: { sortOrder: 'ASC', code: 'ASC' },
      take: 200,
    });

    /* One entry per GRADE. A grade's sections are one choice to a family, and
       the first of them to arrive names it — rows come back in teaching order,
       so that is the section the school itself lists first.

       The code published for a sectioned grade is the `gradeCode`, which is
       what the office matches an application against; for an unsectioned class
       it is the class code, exactly as before. */
    const byGrade = new Map<
      string,
      { code: string; label: string; sortOrder: number }
    >();
    for (const row of rows) {
      const grade = (row.gradeCode ?? '').trim();
      const key = (grade || row.code).toLowerCase();
      if (byGrade.has(key)) continue;
      byGrade.set(key, {
        code: grade || row.code,
        label: grade || (row.name ?? '').trim() || row.code,
        sortOrder: row.sortOrder ?? 0,
      });
    }

    return { branchId, items: [...byGrade.values()] };
  }

  /**
   * GET /consumer/v1/branches/:branchId/products
   * Returns published products for a branch's consumer-visible catalog.
   * Returns an empty list (not 404) when the branch has no catalog configured.
   */
  // The shelf must read live: a price change or an 86 has to reach the shopper
  // on the next look. `must-revalidate` with a zero lifetime means every request
  // asks the server, and Express's ETag turns an unchanged shelf into a cheap
  // 304 — which the app's ApiClient already understands. That is how this gets
  // near-live freshness without a realtime transport.
  @Header('Cache-Control', 'private, max-age=0, must-revalidate')
  @Get(':branchId/products')
  async getBranchProducts(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('page') rawPage?: string,
    @Query('limit') rawLimit?: string,
  ): Promise<ConsumerBranchProductsDto> {
    const page = Math.max(parseInt(rawPage ?? '1', 10) || 1, 1);
    const limit = Math.min(parseInt(rawLimit ?? '50', 10) || 50, 100);
    const skip = (page - 1) * limit;

    // Primary source: branch_catalog_product_links (the POS Seller Hub catalog).
    // These are products explicitly linked to the branch by the merchant.
    const linkedCount = await this.catalogLinkRepo.count({
      where: { branchId },
    });

    if (linkedCount > 0) {
      // Build query via the catalog links table so we include all linked products
      // regardless of their vendor_store_id assignment. Consumer visibility is gated
      // per-branch on the link's consumer_visible flag (not the shared product
      // status), so a branch can resell a supplier's product without the supplier
      // having to publish it.
      const baseQb = this.productRepo
        .createQueryBuilder('p')
        .innerJoin(
          'branch_catalog_product_links',
          'bcl',
          'bcl."productId" = p.id AND bcl."branchId" = :branchId',
          { branchId },
        )
        .where('bcl."consumer_visible" = true')
        .andWhere('p.deleted_at IS NULL');

      const total = await baseQb.clone().getCount();

      const products = await baseQb
        .leftJoinAndSelect('p.tags', 'tag')
        .orderBy('p.name', 'ASC')
        .skip(skip)
        .take(limit)
        .getMany();

      // Resolve per-branch retail price overrides for this page of products
      // (effective price = COALESCE(link.retailPrice, product.price)).
      const productIds = products.map((p) => p.id);
      const links = productIds.length
        ? await this.catalogLinkRepo.find({
            where: { branchId, productId: In(productIds) },
          })
        : [];
      const linkByProduct = new Map(links.map((l) => [l.productId, l]));
      const stockByProduct = await this.shelf.resolveStockStates(
        branchId,
        productIds,
      );

      const items: ConsumerBranchProductItemDto[] = products.map((p) => {
        const link = linkByProduct.get(p.id);
        return {
          id: p.id,
          name: p.name,
          price: this.shelf.effectivePrice(link, p),
          currency: p.currency ?? null,
          imageUrl: p.imageUrl ?? null,
          productType: p.productType ?? null,
          browseCategory:
            resolveProductCatalogMetadata(p).browseCategory ?? null,
          tags: (p.tags ?? [])
            .map((t) => (t?.name ?? '').toLowerCase())
            .filter((name) => name.length > 0),
          stockState: stockByProduct.get(p.id) ?? 'UNKNOWN',
          // The link *is* the shelf entry, so its timestamp is what moves when
          // the merchant reprices, re-lists, or hides the item.
          updatedAt: link?.updatedAt?.toISOString() ?? null,
        };
      });

      return {
        items,
        total,
        page,
        limit,
        catalogSource: 'BRANCH_CATALOG',
        version: this.shelf.shelfVersion(items),
      };
    }

    // Fallback: vendor_store products linked directly by vendor_store_id
    // (legacy path for branches that haven't set up a POS catalog yet).
    const store = await this.vendorStoreRepo.findOne({
      where: { branchId, isConsumerVisible: true },
    });
    if (!store) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        catalogSource: 'VENDOR_STORE_FALLBACK',
        version: '0-0',
      };
    }

    const baseQb = this.productRepo
      .createQueryBuilder('p')
      .where('p.vendorStoreId = :sid', { sid: store.id })
      .andWhere("p.status = 'publish'")
      .andWhere('p.deletedAt IS NULL');

    const total = await baseQb.clone().getCount();

    const products = await baseQb
      .leftJoinAndSelect('p.tags', 'tag')
      .orderBy('p.name', 'ASC')
      .skip(skip)
      .take(limit)
      .getMany();

    // No catalog links means no branch shelf, so there is no branch stock to
    // report either. These rows are marketplace truth, not POS truth — the
    // catalogSource below is how the client knows not to present them as live.
    const items: ConsumerBranchProductItemDto[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      currency: p.currency ?? null,
      imageUrl: p.imageUrl ?? null,
      productType: p.productType ?? null,
      browseCategory: resolveProductCatalogMetadata(p).browseCategory ?? null,
      tags: (p.tags ?? [])
        .map((t) => (t?.name ?? '').toLowerCase())
        .filter((name) => name.length > 0),
      stockState: 'UNKNOWN',
      // No shelf entry exists on this path, so there is no shelf timestamp.
      updatedAt: null,
    }));

    return {
      items,
      total,
      page,
      limit,
      catalogSource: 'VENDOR_STORE_FALLBACK',
      version: this.shelf.shelfVersion(items),
    };
  }
}
