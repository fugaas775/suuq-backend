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
import { serviceFormatLabel } from '../common/service-formats';
import { resolveBranchPresence } from '../common/operating-hours';
import { resolveProductCatalogMetadata } from '../common/utils/media-url.util';

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
   * The predicate itself lives in `ConsumerShelfService` so the order path can
   * ask the identical question — it used to live here privately, which is how
   * the write path ended up trusting client-supplied prices for rows this read
   * would have refused.
   */
  private baseQuery(): SelectQueryBuilder<BranchCatalogProductLink> {
    return this.shelf.applySellablePredicate(
      this.catalogLinkRepo
        .createQueryBuilder('bcl')
        .innerJoin('product', 'p', 'p.id = bcl."productId"')
        .innerJoin('branches', 'b', 'b.id = bcl."branchId"')
        .where('1 = 1'),
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

    if (query.browseCategory) {
      // Free merchant text, matched case- and whitespace-insensitively because
      // "Hot Drinks", "HOT_DRINKS" and " hot drinks " are the same section to
      // everyone except a string comparison.
      qb.andWhere(
        "btrim(LOWER(p.attributes->>'browseCategory')) = btrim(LOWER(:browseCategory))",
        { browseCategory: query.browseCategory },
      );
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
      // Round-robin across shops, not alphabetical by shop.
      //
      // Ordering by `b.name` put every one of a café's 128 items ahead of the
      // next shop's first, so page one of a 347-item marketplace held two shops
      // and the other six were unreachable without guessing a search term. The
      // window function takes each shop's first item, then each shop's second,
      // so a page is a spread rather than one merchant's menu.
      //
      // The link id stays last: without a total tiebreak two rows with equal
      // names can swap between pages and a shopper sees one item twice and
      // another never. Stock state cannot join the sort — it is resolved after
      // the query, from inventory and the kitchen 86-list.
      .addSelect(
        'ROW_NUMBER() OVER (PARTITION BY b.id ORDER BY p.name, bcl.id)',
        'shop_rank',
      )
      .orderBy('"shop_rank"', 'ASC')
      .addOrderBy('b.name', 'ASC')
      .addOrderBy('p.name', 'ASC')
      .addOrderBy('bcl.id', 'ASC')
      .offset(skip)
      .limit(limit)
      .getRawMany<CatalogRow>();

    const [items, categories] = await Promise.all([
      this.toItems(rows),
      this.resolveCategoryFacet(query),
    ]);

    return {
      items,
      total,
      page,
      limit,
      categories,
      version: this.shelf.shelfVersion(items),
    };
  }

  /**
   * The category chips to offer alongside these results.
   *
   * Computed over the filtered set *minus* the category filter itself, so
   * choosing "Burgers" does not collapse the chip row to just "Burgers" and
   * strand a shopper with no way back. Free merchant text out of `attributes`,
   * not the `Category` relation — POS branches leave `categoryId` null and group
   * by `browseCategory`, which is the same token the register's own rail reads.
   */
  private async resolveCategoryFacet(
    query: ConsumerCatalogQueryDto,
  ): Promise<string[]> {
    const qb = this.baseQuery();
    this.applyFilters(qb, { ...query, browseCategory: undefined });

    const rows = await qb
      .select("p.attributes->>'browseCategory'", 'category')
      .andWhere("p.attributes->>'browseCategory' IS NOT NULL")
      .andWhere("btrim(p.attributes->>'browseCategory') <> ''")
      .groupBy("p.attributes->>'browseCategory'")
      .orderBy('COUNT(*)', 'DESC')
      .limit(24)
      .getRawMany<{ category: string }>();

    return rows.map((r) => r.category.trim()).filter(Boolean);
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
