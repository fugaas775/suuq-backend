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
 * Three capabilities are tracked separately, and conflating them is the mistake
 * this file exists to prevent:
 *
 *   - `selfServeCreatable` — POS-S can create a branch of this format.
 *   - `consumerOrderable`  — a guest can send this branch a request.
 *   - `catalogListable`    — this shop's shelf belongs in the cross-shop grid.
 *
 * Every known format must render a store page. Every format now accepts some
 * kind of guest request, but what a guest sends differs: a café takes a basket,
 * a barber takes an appointment, a print shop takes a described job, a hotel
 * takes dates. See `pos-s/docs/pos-consumer-storefront-contract.md`.
 *
 * `catalogListable` is deliberately NOT derived from `consumerOrderable`. It
 * used to be — the cross-shop catalog inferred "sells items in a grid" from
 * "accepts orders" — and the moment a print shop became orderable that inference
 * would have published job tickets as buyable products. A room, a print job, a
 * school place and a rented unit are all things you ask about, not things you
 * put in a shopping grid, so listing is its own opt-in.
 */

export const ORDER_MODES = [
  'TAKEAWAY',
  'DINE_IN',
  'DELIVERY',
  'APPOINTMENT',
  'BOOKING',
  'SCHEDULED',
  'QUOTE',
] as const;

export type OrderMode = (typeof ORDER_MODES)[number];

/**
 * Modes that are meaningless without a time.
 *
 * An appointment for no particular moment, or a laundry pick-up on no
 * particular day, is not an order a shop can act on — it is a row someone has
 * to chase the customer about.
 */
const TIMED_MODES: ReadonlySet<string> = new Set([
  'APPOINTMENT',
  'BOOKING',
  'SCHEDULED',
]);

export function modeNeedsTime(orderMode: string | null | undefined): boolean {
  return TIMED_MODES.has(
    String(orderMode ?? '')
      .trim()
      .toUpperCase(),
  );
}

/** Eating in is the one mode that needs to know where the guest is sitting. */
export function modeNeedsTable(orderMode: string | null | undefined): boolean {
  return (
    String(orderMode ?? '')
      .trim()
      .toUpperCase() === 'DINE_IN'
  );
}

/**
 * Modes where the guest fills a basket off the shelf.
 *
 * Most do: a barber's haircut and a laundry's wash-and-fold are priced items on
 * a shelf the same way a burger is. The two that do not are the ones where what
 * is being asked for cannot be picked from a list — a print job is described,
 * and a stay is a search against dates.
 */
const CARTLESS_MODES: ReadonlySet<string> = new Set(['QUOTE', 'BOOKING']);

export function modeNeedsCart(orderMode: string | null | undefined): boolean {
  return !CARTLESS_MODES.has(
    String(orderMode ?? '')
      .trim()
      .toUpperCase(),
  );
}

/**
 * Modes that are nothing without a description.
 *
 * "Print something" is not a job a shop can quote. The brief IS the order, so a
 * request without one is a row someone has to phone the customer about — the
 * same reason `modeNeedsTime` exists.
 */
export function modeNeedsBrief(orderMode: string | null | undefined): boolean {
  return (
    String(orderMode ?? '')
      .trim()
      .toUpperCase() === 'QUOTE'
  );
}

export interface ServiceFormatDefinition {
  code: string;
  /** Human-readable name shown to shoppers and operators. */
  label: string;
  /** POS-S offers this format when creating a branch. */
  selfServeCreatable: boolean;
  /** A guest can send a branch of this format a request. */
  consumerOrderable: boolean;
  /** Request modes accepted when `consumerOrderable`; empty otherwise. */
  orderModes: OrderMode[];
  /** This shop's shelf appears in the cross-shop marketplace grid. */
  catalogListable: boolean;
}

function def(
  code: string,
  label: string,
  opts: {
    selfServeCreatable?: boolean;
    orderModes?: OrderMode[];
    catalogListable?: boolean;
  } = {},
): ServiceFormatDefinition {
  const orderModes = opts.orderModes ?? [];
  return {
    code,
    label,
    selfServeCreatable: opts.selfServeCreatable ?? false,
    consumerOrderable: orderModes.length > 0,
    orderModes,
    // Opt-in, not opt-out. Forgetting to list a shop is a merchant asking why
    // they are missing; forgetting to exclude one publishes something that was
    // never meant to be bought from a grid.
    catalogListable: opts.catalogListable ?? false,
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
    catalogListable: true,
  }),
  def('GROCERY', 'Grocery', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY', 'DELIVERY'],
    catalogListable: true,
  }),
  def('PHARMACY', 'Pharmacy', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY', 'DELIVERY'],
    catalogListable: true,
  }),
  def('BAKERY', 'Bakery', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY', 'DINE_IN'],
    catalogListable: true,
  }),
  def('BUTCHERY', 'Butchery', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY'],
    catalogListable: true,
  }),
  def('ELECTRONICS', 'Electronics', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY'],
    catalogListable: true,
  }),
  def('GAS_STATION', 'Gas Station', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY'],
    catalogListable: true,
  }),

  // ── Food service ────────────────────────────────────────────────────────
  def('QSR', 'Restaurant / QSR', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY', 'DINE_IN', 'DELIVERY'],
    catalogListable: true,
  }),
  def('CAFETERIA', 'Cafeteria', {
    selfServeCreatable: true,
    orderModes: ['TAKEAWAY', 'DINE_IN'],
    catalogListable: true,
  }),
  // Full-service restaurant. Reachable as a hospitality kitchen format and as a
  // storefront filter; not offered in self-serve branch creation. It takes the
  // same orders a QSR does — it was only unorderable because nothing had asked.
  def('FSR', 'Restaurant', {
    orderModes: ['TAKEAWAY', 'DINE_IN', 'DELIVERY'],
    catalogListable: true,
  }),

  // ── Appointment-led ─────────────────────────────────────────────────────
  // A service is a priced item on a shelf, so these carry a basket like a shop:
  // the guest picks the cut or the treatment, and the mode adds the time.
  def('BARBER', 'Barber', {
    selfServeCreatable: true,
    orderModes: ['APPOINTMENT'],
    catalogListable: true,
  }),
  // Orderable but not self-serve creatable: existing SALON_SPA branches were
  // provisioned by an admin.
  def('SALON_SPA', 'Salon & Spa', {
    orderModes: ['APPOINTMENT'],
    catalogListable: true,
  }),

  // ── Scheduled ───────────────────────────────────────────────────────────
  def('LAUNDRY', 'Laundry', {
    selfServeCreatable: true,
    orderModes: ['SCHEDULED'],
    catalogListable: true,
  }),

  // ── Stay ────────────────────────────────────────────────────────────────
  // Not listable: a night is an availability search against dates, and putting
  // "Standard Room — 1 Night" in a shopping grid sells a room twice.
  def('HOTEL', 'Hotel', {
    selfServeCreatable: true,
    orderModes: ['BOOKING'],
  }),
  // A unit is asked about and then let by an agent, so a guest sends a viewing
  // or lease request rather than buying a month from a grid.
  def('PROPERTY_RENTAL', 'Property Rental', {
    selfServeCreatable: true,
    orderModes: ['BOOKING'],
  }),
  // A print job is described, not picked — the shop reads the brief and prices
  // it. Nothing here belongs in a shopping grid.
  def('PRINTING_PRESS', 'Printing Press', {
    selfServeCreatable: true,
    orderModes: ['QUOTE'],
  }),

  // ── Education ───────────────────────────────────────────────────────────
  // A place is asked about, not bought. Tuition is billed per student, by
  // class, against a folio at the school office, so an enrolment enquiry is a
  // brief — deliberately NOT an appointment, which is cart-shaped and would let
  // a parent put a term's tuition in a basket and check out with it.
  def('SCHOOL', 'School', {
    selfServeCreatable: true,
    orderModes: ['QUOTE'],
  }),

  // ── Government ──────────────────────────────────────────────────────────
  // A regional transport bureau registering vehicles. Deliberately NOT
  // self-serve creatable: a registry office carries statutory authority, its
  // branches are provisioned by an admin against the bureau's own tenant, and
  // a format anyone could pick from the signup grid would let a stranger stand
  // up something that looks like a government office.
  //
  // QUOTE, like SCHOOL: an owner describes a vehicle and asks to register it.
  // Not a cart — nobody puts a statutory fee in a basket and checks out with
  // it, and the fee is priced by class at the office window.
  def('VEHICLE_REGISTRY', 'Vehicle registry', { orderModes: ['QUOTE'] }),

  // ── Fallback ────────────────────────────────────────────────────────────
  def('OTHER', 'Other', { orderModes: ['TAKEAWAY'], catalogListable: true }),
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

/** Codes whose shelves belong in the cross-shop marketplace grid. */
export const CATALOG_LISTABLE_SERVICE_FORMAT_CODES: readonly string[] =
  SERVICE_FORMATS.filter((f) => f.catalogListable).map((f) => f.code);

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
