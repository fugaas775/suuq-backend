/** Response DTO for a successfully placed consumer order. */
export class ConsumerOrderResponseDto {
  /** Unique order identifier (maps to pos_suspended_carts.id). */
  orderId!: number;

  /** Human-readable order reference, e.g. "C-1234". */
  orderNumber!: string;

  /** Branch this order was placed at. */
  branchId!: number;

  /** Service format of the branch. */
  serviceFormat!: string;

  /** Order mode the consumer chose. */
  orderMode!: string;

  /** Status at time of placement (always "RECEIVED" for new orders). */
  status!: 'RECEIVED';
}

/** Response DTO for checking consumer order status. */
export class ConsumerOrderStatusDto {
  orderId!: number;
  orderNumber!: string;
  branchId!: number;
  serviceFormat!: string;
  orderMode!: string;

  /**
   * Lifecycle statuses:
   *  - RECEIVED      — placed, pending staff acknowledgement
   *  - IN_PREPARATION — staff has picked up the order (resumed the cart)
   *  - CANCELLED     — order was discarded by staff
   */
  status!: 'RECEIVED' | 'IN_PREPARATION' | 'COMPLETED' | 'CANCELLED';

  placedAt!: string;
  updatedAt!: string;
}

/** A single branch item in the discovery response. */
export class ConsumerBranchItemDto {
  branchId!: number;
  /**
   * The consumer storefront (`vendor_stores.id`) for this branch, or null when
   * the branch has none.
   *
   * Clients must read this rather than deriving one id from the other: `Branch`
   * and `VendorStore` are a 1:1 spanning two independently-nullable unique FKs,
   * so a `branchId ?? storeId` fallback can silently address a different shop.
   * Null means "no storefront" — degrade, don't guess.
   */
  storeId!: number | null;
  name!: string;
  /**
   * Published hours, day-keyed:
   * `{ "MON": { "open": "08:00", "close": "22:00" }, "SUN": { "closed": true } }`
   */
  operatingHours!: Record<string, unknown> | null;
  /**
   * Whether the shop is trading right now, decided server-side against the
   * shop's own clock. `null` means it published no hours — unknown, not closed,
   * so clients must not render it as shut.
   */
  isOpenNow!: boolean | null;
  /** ISO instant the shop next opens; null when open or unknown. */
  nextOpenAt!: string | null;
  serviceFormat!: string | null;
  serviceFormatLabel!: string;
  address!: string | null;
  city!: string | null;
  phone!: string | null;
  latitude!: number | null;
  longitude!: number | null;
  isActive!: boolean;
  /** Owning vendor/business — lets clients group branches by parent store. */
  ownerId!: number | null;
  ownerName!: string | null;
  logoUrl!: string | null;
}

/** Paginated branch list response. */
export class ConsumerBranchListDto {
  items!: ConsumerBranchItemDto[];
  total!: number;
  page!: number;
  totalPages!: number;
}

/**
 * How buyable a shelf item is right now.
 *
 * A band, never a count: exact on-hand quantity is competitively sensitive and a
 * shopper does not need it. `UNKNOWN` means the branch tracks no inventory for
 * this item — treat it as buyable, not as out of stock.
 */
export type ConsumerStockState =
  | 'IN_STOCK'
  | 'LOW'
  | 'OUT_OF_STOCK'
  | 'UNKNOWN';

/** Where a branch's shelf came from. */
export type ConsumerCatalogSource =
  /** `branch_catalog_product_links` — the merchant's real POS shelf. */
  | 'BRANCH_CATALOG'
  /** Marketplace products for the linked store; the branch has no POS shelf. */
  | 'VENDOR_STORE_FALLBACK';

/** A single product in a branch's catalog. */
export class ConsumerBranchProductItemDto {
  id!: number;
  name!: string;
  price!: number;
  currency!: string | null;
  imageUrl!: string | null;
  /** physical | digital | service | property (null when unset). */
  productType!: string | null;
  /**
   * Lower-cased product tag names. Used by consumer clients to classify
   * catalog items — e.g. HOTEL room charges carry the "room" tag, while
   * ancillary services carry "fnb", "transport", "spa", etc.
   */
  tags!: string[];
  /**
   * Buyability band, from `branch_inventory` and merged with the hospitality
   * 86-list so a dish taken off at the pass reads as out of stock here.
   */
  stockState!: ConsumerStockState;
  /** When this item's shelf entry last changed, for client-side freshness. */
  updatedAt!: string | null;
}

/** Paginated branch products response. */
export class ConsumerBranchProductsDto {
  items!: ConsumerBranchProductItemDto[];
  total!: number;
  page!: number;
  limit!: number;
  /**
   * Which source served this shelf.
   *
   * `VENDOR_STORE_FALLBACK` is not POS truth — the branch has no catalog links,
   * so these are marketplace products for the linked store and carry no branch
   * stock or per-branch price. Clients must not present them as live shelf.
   */
  catalogSource!: ConsumerCatalogSource;
  /**
   * Changes whenever anything on this branch's shelf changes. Lets a client
   * cheaply decide whether to re-render without diffing the page.
   */
  version!: string;
}

/**
 * Deep-link payload for a branch QR code. Branch owners print/post the QR;
 * scanning it opens the branch ordering screen in the consumer app.
 */
export class ConsumerBranchQrDto {
  branchId!: number;
  name!: string;
  /** Universal link encoded in the QR, e.g. https://suuq-s.com/s/b/123 */
  url!: string;
}
