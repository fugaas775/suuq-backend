/**
 * The one service-format vocabulary, shared by every surface.
 *
 * A branch's service format decides what POS-S shows the operator and what the
 * Consumer app shows the shopper. It used to be declared in four places that
 * had quietly drifted apart:
 *
 *   - `SERVICE_FORMAT_CODES` / `FORMAT_ORDER_MODES` (consumer order DTO)
 *   - `SellerBranchServiceFormat`                   (seller workspace)
 *   - `PublicServiceFormat`                         (storefront query filter)
 *   - `PosHospitalityServiceFormat`                 (kitchen subset)
 *
 * The drift was visible to users: `PROPERTY_RENTAL` and `PRINTING_PRESS` are
 * creatable in POS-S but had no label in the Consumer app, `FSR` existed only in
 * the storefront filter, and filtering stores by `GROCERY` was rejected outright.
 *
 * Two capabilities are tracked separately, and conflating them is the mistake
 * this file exists to prevent:
 *
 *   - `selfServeCreatable` — POS-S can create a branch of this format.
 *   - `consumerOrderable`  — a shopper can place an order into the register.
 *
 * Every known format must render a store page; only some accept orders.
 * Consumer→POS ordering is frozen, so `consumerOrderable` reproduces exactly the
 * set that shipped and must not be widened here — see
 * `pos-s/docs/pos-consumer-storefront-contract.md`.
 */

export const ORDER_MODES = [
  'TAKEAWAY',
  'DINE_IN',
  'DELIVERY',
  'APPOINTMENT',
  'BOOKING',
  'SCHEDULED',
] as const;

export type OrderMode = (typeof ORDER_MODES)[number];

export interface ServiceFormatDefinition {
  code: string;
  /** Human-readable name shown to shoppers and operators. */
  label: string;
  /** POS-S offers this format when creating a branch. */
  selfServeCreatable: boolean;
  /** A shopper can place an order at a branch of this format. */
  consumerOrderable: boolean;
  /** Order modes accepted when `consumerOrderable`; empty otherwise. */
  orderModes: OrderMode[];
}

function def(
  code: string,
  label: string,
  opts: {
    selfServeCreatable?: boolean;
    orderModes?: OrderMode[];
  } = {},
): ServiceFormatDefinition {
  const orderModes = opts.orderModes ?? [];
  return {
    code,
    label,
    selfServeCreatable: opts.selfServeCreatable ?? false,
    consumerOrderable: orderModes.length > 0,
    orderModes,
  };
}

/**
 * Declaration order matters: it is the order clients render format filters in,
 * and the retail family reads best grouped together.
 */
export const SERVICE_FORMATS: readonly ServiceFormatDefinition[] = [
  // ── Retail family ───────────────────────────────────────────────────────
  def('RETAIL', 'Retail Store', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY'],
  }),
  def('GROCERY', 'Grocery', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY', 'DELIVERY'],
  }),
  def('PHARMACY', 'Pharmacy', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY', 'DELIVERY'],
  }),
  def('BAKERY', 'Bakery', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY', 'DINE_IN'],
  }),
  def('BUTCHERY', 'Butchery', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY'],
  }),
  def('ELECTRONICS', 'Electronics', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY'],
  }),
  def('GAS_STATION', 'Gas Station', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY'],
  }),

  // ── Food service ────────────────────────────────────────────────────────
  def('QSR', 'Restaurant / QSR', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY', 'DINE_IN', 'DELIVERY'],
  }),
  def('CAFETERIA', 'Cafeteria', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY', 'DINE_IN'],
  }),
  // Full-service restaurant. Reachable as a hospitality kitchen format and as a
  // storefront filter; not offered in self-serve branch creation.
  def('FSR', 'Restaurant'),

  // ── Appointment-led ─────────────────────────────────────────────────────
  def('BARBER', 'Barber', {
    selfServeCreatable: true,
    orderModes: ['APPOINTMENT'],
  }),
  // Orderable but not self-serve creatable: existing SALON_SPA branches were
  // provisioned by an admin.
  def('SALON_SPA', 'Salon & Spa', { orderModes: ['APPOINTMENT'] }),

  // ── Scheduled ───────────────────────────────────────────────────────────
  def('LAUNDRY', 'Laundry', {
    selfServeCreatable: true,
    orderModes: ['SCHEDULED'],
  }),

  // ── Stay ────────────────────────────────────────────────────────────────
  def('HOTEL', 'Hotel', {
    selfServeCreatable: true,
    orderModes: ['BOOKING'],
  }),
  // Creatable in POS-S but deliberately not consumer-orderable: neither has a
  // consumer ordering surface, and adding one would extend the frozen
  // consumer→POS direction. They still need a label so their store pages render.
  def('PROPERTY_RENTAL', 'Property Rental', { selfServeCreatable: true }),
  def('PRINTING_PRESS', 'Printing Press', { selfServeCreatable: true }),

  // ── Fallback ────────────────────────────────────────────────────────────
  def('OTHER', 'Other', { orderModes: ['TAKEAWAY'] }),
];

const BY_CODE = new Map(SERVICE_FORMATS.map((f) => [f.code, f]));

/** Every known format code, including ones that accept no consumer orders. */
export const ALL_SERVICE_FORMAT_CODES: readonly string[] = SERVICE_FORMATS.map(
  (f) => f.code,
);

/** Codes a consumer may place an order against. */
export const CONSUMER_ORDERABLE_SERVICE_FORMAT_CODES: readonly string[] =
  SERVICE_FORMATS.filter((f) => f.consumerOrderable).map((f) => f.code);

/** Codes POS-S may create a branch with. */
export const SELF_SERVE_SERVICE_FORMAT_CODES: readonly string[] =
  SERVICE_FORMATS.filter((f) => f.selfServeCreatable).map((f) => f.code);

/** Label for every known code — used wherever a format is shown to a person. */
export const ALL_SERVICE_FORMAT_LABELS: Record<string, string> =
  Object.fromEntries(SERVICE_FORMATS.map((f) => [f.code, f.label]));

/** Allowed order modes per consumer-orderable code. */
export const CONSUMER_FORMAT_ORDER_MODES: Record<string, OrderMode[]> =
  Object.fromEntries(
    SERVICE_FORMATS.filter((f) => f.consumerOrderable).map((f) => [
      f.code,
      f.orderModes,
    ]),
  );

export function getServiceFormat(
  code: string | null | undefined,
): ServiceFormatDefinition | null {
  if (!code) return null;
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

/** Falls back to the raw code so an unknown format still reads as something. */
export function serviceFormatLabel(code: string | null | undefined): string {
  if (!code) return 'Business';
  return getServiceFormat(code)?.label ?? code;
}
