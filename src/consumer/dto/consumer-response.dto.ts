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
  status!: 'RECEIVED' | 'IN_PREPARATION' | 'CANCELLED';

  placedAt!: string;
  updatedAt!: string;
}

/** A single branch item in the discovery response. */
export class ConsumerBranchItemDto {
  branchId!: number;
  name!: string;
  serviceFormat!: string | null;
  serviceFormatLabel!: string;
  address!: string | null;
  city!: string | null;
  phone!: string | null;
  latitude!: number | null;
  longitude!: number | null;
  isActive!: boolean;
}

/** Paginated branch list response. */
export class ConsumerBranchListDto {
  items!: ConsumerBranchItemDto[];
  total!: number;
  page!: number;
  totalPages!: number;
}

/** A single product in a branch's catalog. */
export class ConsumerBranchProductItemDto {
  id!: number;
  name!: string;
  price!: number;
  currency!: string | null;
  imageUrl!: string | null;
}

/** Paginated branch products response. */
export class ConsumerBranchProductsDto {
  items!: ConsumerBranchProductItemDto[];
  total!: number;
  page!: number;
  limit!: number;
}
