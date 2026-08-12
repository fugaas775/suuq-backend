import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import { KitchenProductAvailability } from '../hospitality/entities/kitchen-product-availability.entity';
import { Product } from '../products/entities/product.entity';
import { BranchCatalogProductLink } from '../retail/entities/branch-catalog-product-link.entity';
import { ConsumerStockState } from './dto/consumer-response.dto';
import { CATALOG_LISTABLE_SERVICE_FORMAT_CODES } from '../common/service-formats';

/**
 * The rules a shelf obeys, wherever it is read from.
 *
 * One branch's shelf (`/consumer/v1/branches/:id/products`) and the cross-shop
 * catalog (`/consumer/v1/catalog`) show the same products under the same
 * promises: the price the merchant set for that branch, a buyability band rather
 * than a count, and a freshness fingerprint. Those promises were written once,
 * for one endpoint. Leaving them there and writing them again for the catalog is
 * how this codebase ended up with four copies of the service-format table that
 * disagreed with each other — so they live here, and both readers call in.
 */

/**
 * The merchant's own "getting low" threshold is `safetyStock`; when they have
 * not set one, fall back to a small constant so "low" still means something.
 */
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/**
 * Formats whose shelves belong in a product catalog.
 *
 * Read straight off the registry's own `catalogListable` flag. It used to be
 * inferred here — "accepts a mode other than BOOKING" — which held only while
 * every orderable format sold items from a grid. Once a print shop could take a
 * QUOTE and a school an APPOINTMENT, that inference would have published job
 * tickets and tuition as buyable products. Whether a shop takes guest requests
 * and whether its shelf is shoppable are two questions now, so the registry
 * answers them separately.
 */
export const CATALOG_SERVICE_FORMATS: readonly string[] =
  CATALOG_LISTABLE_SERVICE_FORMAT_CODES;

/** Composite key for a shelf entry, which is per (branch, product). */
function pairKey(branchId: number, productId: number): string {
  return `${branchId}:${productId}`;
}

/** One shelf entry as the server knows it — never as a client described it. */
export interface SellableShelfLine {
  productId: number;
  name: string;
  price: number;
  currency: string | null;
  stockState: ConsumerStockState;
}

@Injectable()
export class ConsumerShelfService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(BranchInventory)
    private readonly branchInventoryRepo: Repository<BranchInventory>,
    @InjectRepository(KitchenProductAvailability)
    private readonly kitchenAvailabilityRepo: Repository<KitchenProductAvailability>,
    @InjectRepository(BranchCatalogProductLink)
    private readonly linkRepo: Repository<BranchCatalogProductLink>,
  ) {}

  /**
   * What a shopper is allowed to buy, before any filter — the one definition.
   *
   * Applied to a builder aliased `bcl` (link) / `p` (product) / `b` (branch).
   * Both the catalog read and the order write go through it, and that is the
   * whole point: the read used to own this predicate privately, so the write had
   * no way to ask the same question and simply trusted whatever the client sent.
   *
   * The last condition is the one that matters most. A supplier's product row
   * carries their *wholesale* price — `createProductOffer` copies
   * `unitWholesalePrice` onto `product.price` — and the shelf falls back to
   * `product.price` when the branch has set no retail price. On a supplier outlet
   * that fallback would publish trade pricing to the public and hand every
   * retailer's margin away. Guarding only the read left the order path able to
   * buy at exactly the price the read refuses to show.
   */
  applySellablePredicate<T>(qb: SelectQueryBuilder<T>): SelectQueryBuilder<T> {
    return qb
      .andWhere('bcl.consumer_visible = true')
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

  /**
   * The authoritative price and name for products a shopper is trying to buy at
   * one branch.
   *
   * A product missing from the returned map is not sellable there — it may not
   * exist, may be soft-deleted, may sit on a different shop's shelf, may be
   * unlisted, or may be a supplier row with no consumer price. The caller must
   * treat absence as a refusal rather than falling back to anything the client
   * supplied, because everything the client supplied is what this exists to
   * distrust.
   */
  async resolveSellableLines(
    branchId: number,
    productIds: number[],
  ): Promise<Map<number, SellableShelfLine>> {
    const ids = Array.from(
      new Set(productIds.filter((id) => Number.isInteger(id) && id > 0)),
    );
    const result = new Map<number, SellableShelfLine>();
    if (!ids.length) return result;

    const qb = this.linkRepo
      .createQueryBuilder('bcl')
      .innerJoin('product', 'p', 'p.id = bcl."productId"')
      .innerJoin('branches', 'b', 'b.id = bcl."branchId"')
      .where('bcl."branchId" = :branchId', { branchId })
      .andWhere('p.id IN (:...ids)', { ids });

    const rows = await this.applySellablePredicate(qb)
      .select([
        'p.id AS "productId"',
        'p.name AS "name"',
        'p.price AS "productPrice"',
        'p.currency AS "currency"',
        'bcl.retail_price AS "retailPrice"',
        'bcl.retail_sale_price AS "retailSalePrice"',
      ])
      .getRawMany<{
        productId: number;
        name: string;
        productPrice: string | number;
        currency: string | null;
        retailPrice: string | number | null;
        retailSalePrice: string | number | null;
      }>();

    const stockByPair = await this.resolveStockStatesForPairs(
      rows.map((r) => ({ branchId, productId: Number(r.productId) })),
    );

    for (const row of rows) {
      const productId = Number(row.productId);
      result.set(productId, {
        productId,
        name: row.name,
        price: this.effectivePrice(
          {
            retailPrice:
              row.retailPrice == null ? null : Number(row.retailPrice),
            retailSalePrice:
              row.retailSalePrice == null ? null : Number(row.retailSalePrice),
          },
          { price: Number(row.productPrice) },
        ),
        currency: row.currency ?? null,
        stockState: stockByPair.get(pairKey(branchId, productId)) ?? 'UNKNOWN',
      });
    }
    return result;
  }

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
   */
  toStockState(
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
   * Resolves buyability for shelf entries that may span several branches.
   *
   * Two independent sources, and the stricter one wins: `branch_inventory`
   * counts physical stock, while the hospitality 86-list is the kitchen saying
   * "we're out of this" regardless of what inventory thinks. A dish 86'd at the
   * pass must read as unavailable to the shopper even when no stock is tracked.
   *
   * Keyed by `branchId:productId` because one product sits on many shelves and
   * is not equally available on all of them.
   */
  async resolveStockStatesForPairs(
    pairs: Array<{ branchId: number; productId: number }>,
  ): Promise<Map<string, ConsumerStockState>> {
    const result = new Map<string, ConsumerStockState>();
    if (pairs.length === 0) return result;

    const branchIds = Array.from(new Set(pairs.map((p) => p.branchId)));
    const productIds = Array.from(new Set(pairs.map((p) => p.productId)));

    const [inventoryRows, kitchenRows, stockManagedRows] = await Promise.all([
      this.branchInventoryRepo.find({
        where: { branchId: In(branchIds), productId: In(productIds) },
      }),
      // productId is varchar on the 86 table (it also holds ad-hoc menu keys),
      // so match on the string form.
      this.kitchenAvailabilityRepo.find({
        where: {
          branchId: In(branchIds),
          productId: In(productIds.map(String)),
        },
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
    const inventoryByPair = new Map(
      inventoryRows.map((row) => [pairKey(row.branchId, row.productId), row]),
    );
    const unavailableInKitchen = new Set(
      kitchenRows
        .filter((row) => !row.available)
        .map((row) => pairKey(row.branchId, Number(row.productId))),
    );

    for (const { branchId, productId } of pairs) {
      const key = pairKey(branchId, productId);
      result.set(
        key,
        unavailableInKitchen.has(key)
          ? 'OUT_OF_STOCK'
          : this.toStockState(
              inventoryByPair.get(key),
              managesStockByProduct.get(productId) ?? true,
            ),
      );
    }
    return result;
  }

  /** Single-branch convenience wrapper, keyed by productId. */
  async resolveStockStates(
    branchId: number,
    productIds: number[],
  ): Promise<Map<number, ConsumerStockState>> {
    const byPair = await this.resolveStockStatesForPairs(
      productIds.map((productId) => ({ branchId, productId })),
    );
    return new Map(
      productIds.map((productId) => [
        productId,
        byPair.get(pairKey(branchId, productId)) ?? 'UNKNOWN',
      ]),
    );
  }

  /**
   * What this branch charges for this product.
   *
   * The per-branch override wins over the shared product price so two branches
   * reselling the same supplier product can price independently without either
   * of them mutating the row they share.
   */
  effectivePrice(
    link:
      | Pick<BranchCatalogProductLink, 'retailPrice' | 'retailSalePrice'>
      | null
      | undefined,
    product: Pick<Product, 'price'>,
  ): number {
    if (link?.retailSalePrice != null) return Number(link.retailSalePrice);
    if (link?.retailPrice != null) return Number(link.retailPrice);
    return Number(product.price);
  }

  /**
   * A cheap fingerprint of the shelf a client just received.
   *
   * Built from the newest `updatedAt` across the page plus the row count, so any
   * price change, 86 flip, or item appearing/disappearing moves it. Lets the app
   * decide whether to re-render without diffing.
   */
  shelfVersion(items: Array<{ updatedAt?: string | null }>): string {
    let newest = 0;
    for (const item of items) {
      const at = item.updatedAt ? Date.parse(item.updatedAt) : 0;
      if (at > newest) newest = at;
    }
    return `${items.length}-${newest}`;
  }
}
