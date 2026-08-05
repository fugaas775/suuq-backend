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
import { Repository, SelectQueryBuilder } from 'typeorm';
import { BranchCatalogProductLink } from '../retail/entities/branch-catalog-product-link.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import {
  ConsumerCatalogItemDto,
  ConsumerCatalogListDto,
} from './dto/consumer-response.dto';
import { ConsumerCatalogQueryDto } from './dto/consumer-catalog-query.dto';
import { ConsumerShelfService } from './consumer-shelf.service';
import {
  CONSUMER_FORMAT_ORDER_MODES,
  serviceFormatLabel,
} from '../common/service-formats';
import { resolveBranchPresence } from '../common/operating-hours';
import { resolveProductCatalogMetadata } from '../common/utils/media-url.util';

/**
 * Formats whose shelves belong in a product catalog.
 *
 * Derived from the service-format registry rather than listed here, so a format
 * that stops (or starts) accepting consumer orders needs no edit in this file.
 * Two exclusions fall out of that: formats that accept no consumer order at all
 * (FSR, PROPERTY_RENTAL, PRINTING_PRESS), and booking-only formats like HOTEL —
 * a room is not a cart line, it is an availability search against dates, and
 * putting "Standard Room — 1 Night" in a shopping grid sells a night that may
 * already be occupied.
 */
const CATALOG_SERVICE_FORMATS: readonly string[] = Object.entries(
  CONSUMER_FORMAT_ORDER_MODES,
)
  .filter(([, modes]) => modes.some((mode) => mode !== 'BOOKING'))
  .map(([code]) => code);

/** The shape one catalog row comes back as from the query builder. */
interface CatalogRow {
  branchId: number;
  branchName: string;
  serviceFormat: string | null;
  city: string | null;
  supplierOutletProfileId: number | null;
  operatingHours: Record<string, unknown> | null;
  productId: number;
  productName: string;
  productPrice: string | number;
  currency: string | null;
  imageUrl: string | null;
  productType: string | null;
  attributes: unknown;
  retailPrice: string | number | null;
  retailSalePrice: string | number | null;
  linkUpdatedAt: Date | null;
}

/**
 * The cross-shop catalog — every consumer-visible shelf, searchable at once.
 *
 * Unauthenticated by design: a shopper browsing suuq-s.com has no account and
 * must never be asked for one. It reads the same rows and applies the same
 * pricing and stock rules as one branch's shelf, through `ConsumerShelfService`.
 */
@Controller('consumer/v1/catalog')
export class ConsumerCatalogController {
  constructor(
    @InjectRepository(BranchCatalogProductLink)
    private readonly catalogLinkRepo: Repository<BranchCatalogProductLink>,
    @InjectRepository(VendorStore)
    private readonly vendorStoreRepo: Repository<VendorStore>,
    private readonly shelf: ConsumerShelfService,
  ) {}

  /**
   * Everything a shopper is allowed to see, before any filter.
   *
   * The last condition is the one that matters most. A supplier's product row
   * carries their *wholesale* price — `createProductOffer` copies
   * `unitWholesalePrice` onto `product.price` — and the shelf falls back to
   * `product.price` when the branch has set no retail price. On a supplier
   * outlet that fallback would publish the wholesale price to shoppers and hand
   * every retailer's margin to the public. The supplier UI refuses to list
   * without a consumer price; this refuses to *show* one that slipped through by
   * any other route.
   */
  private baseQuery(): SelectQueryBuilder<BranchCatalogProductLink> {
    return this.catalogLinkRepo
      .createQueryBuilder('bcl')
      .innerJoin('product', 'p', 'p.id = bcl."productId"')
      .innerJoin('branches', 'b', 'b.id = bcl."branchId"')
      .where('bcl.consumer_visible = true')
      .andWhere('p.deleted_at IS NULL')
      .andWhere('b."isActive" = true')
      .andWhere(
        `EXISTS (
          SELECT 1 FROM vendor_stores vs
          WHERE vs."branchId" = b.id AND vs."isConsumerVisible" = true
        )`,
      )
      .andWhere('b."serviceFormat" IN (:...catalogFormats)', {
        catalogFormats: CATALOG_SERVICE_FORMATS,
      })
      .andWhere(
        '(b."supplierOutletProfileId" IS NULL OR bcl.retail_price IS NOT NULL)',
      );
  }

  private applyFilters(
    qb: SelectQueryBuilder<BranchCatalogProductLink>,
    query: ConsumerCatalogQueryDto,
  ): void {
    if (query.branchId != null) {
      qb.andWhere('b.id = :branchId', { branchId: query.branchId });
    }

    if (query.q) {
      // Matched against the product and the shop, because a shopper typing
      // "Bilan" may be after the shop, not a thing called Bilan.
      qb.andWhere('(p.name ILIKE :search OR b.name ILIKE :search)', {
        search: `%${query.q}%`,
      });
    }

    if (query.serviceFormat?.length) {
      qb.andWhere('b."serviceFormat" IN (:...formats)', {
        formats: query.serviceFormat,
      });
    }

    if (query.sellerType === 'SUPPLIER') {
      qb.andWhere('b."supplierOutletProfileId" IS NOT NULL');
    } else if (query.sellerType === 'BRANCH') {
      qb.andWhere('b."supplierOutletProfileId" IS NULL');
    }

    if (query.categoryId != null) {
      qb.andWhere('p."categoryId" = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    if (query.city) {
      qb.andWhere('LOWER(b.city) = LOWER(:city)', { city: query.city });
    }

    if (query.lat != null && query.lng != null && query.radius != null) {
      // Same Haversine filter the branch list uses, so "within 5 km" means the
      // same thing whether a shopper is browsing shops or things.
      qb.andWhere(
        `(
          6371 * ACOS(GREATEST(-1, LEAST(1,
            COS(RADIANS(:lat)) * COS(RADIANS(CAST(b.latitude AS DOUBLE PRECISION)))
            * COS(RADIANS(CAST(b.longitude AS DOUBLE PRECISION)) - RADIANS(:lng))
            + SIN(RADIANS(:lat)) * SIN(RADIANS(CAST(b.latitude AS DOUBLE PRECISION)))
          )))
        ) <= :radius`,
        { lat: query.lat, lng: query.lng, radius: query.radius },
      );
    }
  }

  private selectRowColumns(
    qb: SelectQueryBuilder<BranchCatalogProductLink>,
  ): SelectQueryBuilder<BranchCatalogProductLink> {
    return qb.select([
      'b.id AS "branchId"',
      'b.name AS "branchName"',
      'b."serviceFormat" AS "serviceFormat"',
      'b.city AS "city"',
      'b."supplierOutletProfileId" AS "supplierOutletProfileId"',
      'p.id AS "productId"',
      'p.name AS "productName"',
      'p.price AS "productPrice"',
      'p.currency AS "currency"',
      'p."imageUrl" AS "imageUrl"',
      'p.product_type AS "productType"',
      'p.attributes AS "attributes"',
      'bcl.retail_price AS "retailPrice"',
      'bcl.retail_sale_price AS "retailSalePrice"',
      'bcl."updatedAt" AS "linkUpdatedAt"',
    ]);
  }

  /**
   * Turns raw rows into catalog items, with prices, stock bands and presence.
   *
   * `operatingHours` is resolved from `vendor_stores` in one extra read rather
   * than joined, because a page of 50 items commonly comes from a handful of
   * shops and joining would repeat the same JSON blob dozens of times.
   */
  private async toItems(rows: CatalogRow[]): Promise<ConsumerCatalogItemDto[]> {
    if (!rows.length) return [];

    const branchIds = Array.from(new Set(rows.map((r) => Number(r.branchId))));
    const [stockByPair, stores] = await Promise.all([
      this.shelf.resolveStockStatesForPairs(
        rows.map((r) => ({
          branchId: Number(r.branchId),
          productId: Number(r.productId),
        })),
      ),
      this.vendorStoreRepo.find({
        where: branchIds.map((branchId) => ({
          branchId,
          isConsumerVisible: true,
        })),
        select: ['branchId', 'operatingHours'],
      }),
    ]);

    const hoursByBranch = new Map(
      stores
        .filter((s) => s.branchId != null)
        .map((s) => [Number(s.branchId), s.operatingHours ?? null]),
    );

    return rows.map((row) => {
      const branchId = Number(row.branchId);
      const productId = Number(row.productId);
      const presence = resolveBranchPresence(
        hoursByBranch.get(branchId) ?? null,
      );
      return {
        branchId,
        branchName: row.branchName,
        serviceFormat: row.serviceFormat ?? null,
        serviceFormatLabel: serviceFormatLabel(row.serviceFormat),
        sellerType: row.supplierOutletProfileId != null ? 'SUPPLIER' : 'BRANCH',
        city: row.city ?? null,
        isOpenNow: presence.isOpenNow,
        productId,
        name: row.productName,
        price: this.shelf.effectivePrice(
          {
            retailPrice:
              row.retailPrice == null ? null : Number(row.retailPrice),
            retailSalePrice:
              row.retailSalePrice == null ? null : Number(row.retailSalePrice),
          },
          { price: Number(row.productPrice) },
        ),
        currency: row.currency ?? null,
        imageUrl: row.imageUrl ?? null,
        productType: row.productType ?? null,
        // Tags need a to-many join that would break the flat row read; the shop
        // page carries them, and a grid tile has nowhere to show them anyway.
        tags: [],
        browseCategory:
          resolveProductCatalogMetadata({ attributes: row.attributes })
            .browseCategory ?? null,
        stockState: stockByPair.get(`${branchId}:${productId}`) ?? 'UNKNOWN',
        updatedAt: row.linkUpdatedAt
          ? new Date(row.linkUpdatedAt).toISOString()
          : null,
      };
    });
  }

  /**
   * GET /consumer/v1/catalog
   *
   * Freshness follows the branch shelf: revalidate every time, and let the
   * ETag turn an unchanged page into a cheap 304. A price change or an 86 must
   * reach the shopper on their next look.
   */
  @Header('Cache-Control', 'private, max-age=0, must-revalidate')
  @Get()
  async search(
    @Query() query: ConsumerCatalogQueryDto,
  ): Promise<ConsumerCatalogListDto> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(query.limit ?? 24, 50);
    const skip = (page - 1) * limit;

    const countQb = this.baseQuery();
    this.applyFilters(countQb, query);
    const total = await countQb.getCount();

    const rowsQb = this.baseQuery();
    this.applyFilters(rowsQb, query);
    const rows = await this.selectRowColumns(rowsQb)
      // Grouped by shop, then alphabetical, then the link id as a stable
      // tiebreak — without that last one two rows with equal names can swap
      // between pages and a shopper sees one item twice and another never.
      // Stock state cannot join the sort: it is resolved after the query, from
      // inventory and the kitchen 86-list.
      .orderBy('b.name', 'ASC')
      .addOrderBy('p.name', 'ASC')
      .addOrderBy('bcl.id', 'ASC')
      .offset(skip)
      .limit(limit)
      .getRawMany<CatalogRow>();

    const items = await this.toItems(rows);
    return {
      items,
      total,
      page,
      limit,
      version: this.shelf.shelfVersion(items),
    };
  }

  /**
   * GET /consumer/v1/catalog/:branchId/:productId
   * One shelf entry, for a shareable product page.
   */
  @Header('Cache-Control', 'private, max-age=0, must-revalidate')
  @Get(':branchId/:productId')
  async getItem(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('productId', ParseIntPipe) productId: number,
  ): Promise<ConsumerCatalogItemDto> {
    const qb = this.baseQuery()
      .andWhere('b.id = :branchId', { branchId })
      .andWhere('p.id = :productId', { productId });

    const row = await this.selectRowColumns(qb).getRawOne<CatalogRow>();
    if (!row) {
      // Not found and not-for-sale-here read the same to a shopper, and saying
      // which would leak that a hidden item exists.
      throw new NotFoundException('That item is not available.');
    }

    const [item] = await this.toItems([row]);
    return item;
  }
}
