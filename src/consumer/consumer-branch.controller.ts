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
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import { KitchenProductAvailability } from '../hospitality/entities/kitchen-product-availability.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { Product } from '../products/entities/product.entity';
import { BranchCatalogProductLink } from '../retail/entities/branch-catalog-product-link.entity';
import {
  ConsumerBranchItemDto,
  ConsumerBranchListDto,
  ConsumerBranchProductItemDto,
  ConsumerBranchProductsDto,
  ConsumerBranchQrDto,
  ConsumerStockState,
} from './dto/consumer-response.dto';
import { ConsumerBranchQueryDto } from './dto/consumer-branch-query.dto';
import { serviceFormatLabel } from '../common/service-formats';
import { resolveBranchPresence } from '../common/operating-hours';

const toFormatLabel = serviceFormatLabel;

/**
 * Maps a branch's inventory row to a buyability band.
 *
 * No row means the branch does not track inventory for this item (services,
 * made-to-order food, unmanaged SKUs) — that is `UNKNOWN` and stays buyable.
 * Reading it as out-of-stock would empty the shelf of every branch that has not
 * onboarded inventory.
 *
 * A row can exist and still mean nothing. A café's menu carries
 * `manage_stock = false` on every line — an americano is made when ordered, not
 * drawn down from a count — yet the branch may still have inventory rows sitting
 * at zero from onboarding. Reading those as out-of-stock marked all 128 items on
 * one café's shelf sold out, which is the same empty shelf this function's first
 * rule exists to prevent. An untracked product is UNKNOWN whatever its row says.
 *
 * `safetyStock` is the merchant's own "getting low" threshold; when they have
 * not set one, fall back to a small constant so "low" still means something.
 */
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

function toStockState(
  inventory: BranchInventory | undefined,
  managesStock = true,
): ConsumerStockState {
  if (!inventory || !managesStock) return 'UNKNOWN';
  const available = Number(inventory.availableToSell ?? 0);
  if (available <= 0) return 'OUT_OF_STOCK';
  const lowThreshold =
    Number(inventory.safetyStock ?? 0) > 0
      ? Number(inventory.safetyStock)
      : DEFAULT_LOW_STOCK_THRESHOLD;
  return available <= lowThreshold ? 'LOW' : 'IN_STOCK';
}

/**
 * A cheap fingerprint of the shelf a client just received.
 *
 * Built from the newest `updatedAt` across the page plus the row count, so any
 * price change, 86 flip, or item appearing/disappearing moves it. Lets the app
 * decide whether to re-render without diffing.
 */
function shelfVersion(items: ConsumerBranchProductItemDto[]): string {
  let newest = 0;
  for (const item of items) {
    const at = item.updatedAt ? Date.parse(item.updatedAt) : 0;
    if (at > newest) newest = at;
  }
  return `${items.length}-${newest}`;
}

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
    logoUrl: owner?.avatarUrl ?? null,
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
    @InjectRepository(BranchInventory)
    private readonly branchInventoryRepo: Repository<BranchInventory>,
    @InjectRepository(KitchenProductAvailability)
    private readonly kitchenAvailabilityRepo: Repository<KitchenProductAvailability>,
  ) {}

  /**
   * Resolves buyability for a page of products at one branch.
   *
   * Two independent sources, and the stricter one wins: `branch_inventory`
   * counts physical stock, while the hospitality 86-list is the kitchen saying
   * "we're out of this" regardless of what inventory thinks. A dish 86'd at the
   * pass must read as unavailable to the shopper even when no stock is tracked.
   */
  private async resolveStockStates(
    branchId: number,
    productIds: number[],
  ): Promise<Map<number, ConsumerStockState>> {
    if (productIds.length === 0) return new Map();

    const [inventoryRows, kitchenRows, stockManagedRows] = await Promise.all([
      this.branchInventoryRepo.find({
        where: { branchId, productId: In(productIds) },
      }),
      // productId is varchar on the 86 table (it also holds ad-hoc menu keys),
      // so match on the string form.
      this.kitchenAvailabilityRepo.find({
        where: { branchId, productId: In(productIds.map(String)) },
      }),
      // Whether each product is stock-tracked at all. Without this a café's
      // untracked menu reads as sold out — see toStockState.
      this.productRepo.find({
        where: { id: In(productIds) },
        select: { id: true, manageStock: true },
      }),
    ]);

    const managesStockByProduct = new Map(
      stockManagedRows.map((row) => [
        Number(row.id),
        row.manageStock !== false,
      ]),
    );

    const inventoryByProduct = new Map(
      inventoryRows.map((row) => [row.productId, row]),
    );
    const unavailableInKitchen = new Set(
      kitchenRows.filter((row) => !row.available).map((row) => row.productId),
    );

    return new Map(
      productIds.map((id) => [
        id,
        unavailableInKitchen.has(String(id))
          ? 'OUT_OF_STOCK'
          : toStockState(
              inventoryByProduct.get(id),
              managesStockByProduct.get(id) ?? true,
            ),
      ]),
    );
  }

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
      const stockByProduct = await this.resolveStockStates(
        branchId,
        productIds,
      );

      const items: ConsumerBranchProductItemDto[] = products.map((p) => {
        const link = linkByProduct.get(p.id);
        const effectivePrice =
          link?.retailSalePrice != null
            ? Number(link.retailSalePrice)
            : link?.retailPrice != null
              ? Number(link.retailPrice)
              : Number(p.price);
        return {
          id: p.id,
          name: p.name,
          price: effectivePrice,
          currency: p.currency ?? null,
          imageUrl: p.imageUrl ?? null,
          productType: p.productType ?? null,
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
        version: shelfVersion(items),
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
      version: shelfVersion(items),
    };
  }
}
