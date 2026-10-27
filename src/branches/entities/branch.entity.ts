import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { RetailTenant } from '../../retail/entities/retail-tenant.entity';
import { BranchHomeConfig } from './branch-home-config.type';

@Entity('branches')
@Index(['ownerId', 'name'])
export class Branch {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  code?: string | null;

  @Column({ type: 'int', nullable: true })
  ownerId?: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ownerId' })
  owner?: User | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  city?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  country?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  serviceFormat?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone?: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude?: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude?: number | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  externalRef?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  tinNumber?: string | null;

  @Column({ type: 'int', nullable: true })
  retailTenantId?: number | null;

  @ManyToOne(() => RetailTenant, (retailTenant) => retailTenant.branches, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'retailTenantId' })
  retailTenant?: RetailTenant | null;

  @Column({ default: true })
  isActive!: boolean;

  /** FK to vendor_stores.id — set when this branch has a linked consumer store. */
  @Column({ type: 'int', nullable: true, unique: true })
  vendorStoreId?: number | null;

  /**
   * Default marketplace category id pre-selected when adding RETAIL products at
   * this branch (e.g. a "Fashion & Apparel → Men's Fashion" branch). Null = none.
   * References category.id; no FK constraint (kept loose like other branch refs).
   */
  @Column({ type: 'int', nullable: true })
  defaultCategoryId?: number | null;

  /**
   * Standard checkout time policy for HOTEL branches, as "HH:MM" 24h EAT
   * (e.g. "11:00", "11:30", "10:30"). Drives the seeded folio default
   * check-in/checkout time and the early-check-in / late-checkout fee
   * boundary on the register. Null = use the global 11:00 default.
   * HOTEL-only; ignored by other service formats.
   */
  @Column({ type: 'varchar', length: 5, nullable: true })
  checkoutPolicyTime?: string | null;

  /**
   * Register schedule, "HH:MM" 24h EAT. At registerClosesAt the server closes
   * every session still open; before registerOpensAt (from the closing time,
   * or midnight) an operator cannot start one. Null = no schedule.
   */
  @Column({ type: 'varchar', length: 5, nullable: true })
  registerOpensAt?: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  registerClosesAt?: string | null;

  /**
   * Brand logo URL for this branch (uploaded via /media). Shown in the register
   * branch badge across all service formats and on receipts. Null = no logo.
   */
  @Column({ type: 'varchar', length: 512, nullable: true })
  logoUrl?: string | null;

  /**
   * Where this branch's own operational email goes. Null = the owner's account.
   *
   * The owner's account address was the only one there was, and it cannot tell
   * two branches apart: one person owning a school in Godey and a school in
   * Qalaafe gets both schools' enrolment applications in one inbox, and neither
   * school's office gets any. This is the address of the DESK — the head
   * teacher, the bursar, whoever actually answers — and it is per branch
   * because that is the grain the question has.
   *
   * ⚠ Not a public contact address. It is never returned on any consumer route
   * and must not become the "email the shop" link: it is where the platform
   * writes TO a branch, not an address published on its behalf.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  notificationEmail?: string | null;

  /**
   * Whether this branch charges tax (VAT) on sales. All service formats honour it.
   *
   * Defaults to FALSE — in every service format, schools included (owner's
   * policy, 2026-10-27). A branch that was created untaxed charges exactly what
   * is on its shelf; its owner switches VAT on in Seller HQ, which asks for the
   * TIN alongside the toggle. The 2026-08-07 default of TRUE, and the later
   * "on when a TIN was typed at signup" rule, are both gone: a school with a tax
   * id still charges no VAT on tuition, and a shop that is registered is one
   * toggle away either way.
   *
   * Branches that already exist are never touched by a default — a default only
   * decides where a NEW row starts. Only ever flip an existing branch through
   * Seller HQ, by its own owner.
   *
   * Every creation site also writes `taxEnabled: false` explicitly, so a row
   * inserted by a path that forgets the column still lands untaxed through the
   * column default, and one that remembers it agrees with the default.
   */
  @Column({ type: 'boolean', default: false })
  taxEnabled!: boolean;

  /**
   * Tax (VAT) rate as a FRACTION — 0.1500 is 15%. The fraction is the single
   * unit used end to end: DB, wire (`items[].taxRate`), and the POS session.
   * Percent exists only inside the Seller HQ input. Defaults to the Ethiopian
   * 15% so enabling the toggle is a one-click action; ignored while
   * {@link taxEnabled} is false.
   *
   * Tax is EXCLUSIVE (added on top): grandTotal = netSubtotal + tax.
   *
   * The transformer is required — pg returns `numeric` as a string, and a
   * string would multiply fine but break every other numeric operation.
   */
  @Column('decimal', {
    precision: 5,
    scale: 4,
    default: 0.15,
    transformer: {
      to: (value: number | null | undefined) => value,
      from: (value: string | number | null | undefined) =>
        value == null
          ? 0
          : typeof value === 'string'
            ? parseFloat(value)
            : value,
    },
  })
  taxRate!: number;

  /**
   * Whether the branch's catalog prices ALREADY contain the tax.
   *
   * false (default) — EXCLUSIVE. The price is net; tax is added at checkout, so
   * enabling tax raises what the customer pays by the rate.
   *
   * true — INCLUSIVE. The price on the shelf is what the customer pays; the tax
   * is extracted out of it for the receipt and the ledger. Enabling tax changes
   * no price at all, only how the takings are split between revenue and tax
   * payable. This is what a branch that already priced its goods with VAT in
   * them wants, and it is the only mode where turning tax on is free of any
   * re-pricing.
   *
   * Both modes satisfy `grandTotal = netSubtotal + tax` and
   * `tax = grandTotal − grandTotal / (1 + rate)`; they differ only in whether
   * the discounted line amount is read as the net or as the gross.
   */
  @Column({ type: 'boolean', default: false })
  taxInclusive!: boolean;

  /**
   * What this branch's tax is CALLED on a receipt — "VAT", "TOT", "Sales Tax".
   * Null means VAT, which is what every receipt printed before this existed.
   *
   * A name, not a regime. The system has no input-credit concept, so an
   * Ethiopian business on Turnover Tax differs from one on VAT in exactly two
   * ways a till can see: the rate, and the word on the slip. Modelling TOT as a
   * second regime would add machinery that computes the same numbers.
   *
   * It matters because printing "VAT" on the receipt of a business that is not
   * VAT-registered misstates its tax status to its own customers.
   */
  @Column({ type: 'varchar', length: 32, nullable: true })
  taxName?: string | null;

  /**
   * QSR only: when an order is sent to the kitchen, also print the customer's
   * copy of it — the whole order at what it owes, headed CUSTOMER COPY / Not
   * for the kitchen — on the same printer, in the same job.
   *
   * Off by default: plenty of branches do not want two papers on every order,
   * and the board's 🧾 prints the customer's copy on demand either way.
   */
  @Column({ type: 'boolean', default: false })
  qsrCustomerCopyOnSend!: boolean;

  /**
   * Per-branch layout for the branch-customizable Home page (POS `/home`) — which
   * widgets show and in what order, custom quick-links, a welcome note and
   * branding. Null = never customized; the client renders a per-format default.
   * The fixed analytics Dashboard (`/dashboard`) ignores this. See
   * {@link BranchHomeConfig}.
   */
  @Column({ type: 'jsonb', nullable: true })
  homeConfig?: BranchHomeConfig | null;

  /**
   * When set, this branch is a wholesale Supplier's backing "cash & carry"
   * outlet — the branch the supplier's Suuq POS counter runs against — rather
   * than an ordinary retail branch. References supplier_profiles.id.
   *
   * Such outlets are deliberately EXCLUDED from a user's normal POS branch list
   * (collectPosBranchAccessForUser) so the supplier stays branch-independent and
   * no Retail⇄Wholesale switcher appears; they are surfaced to the client via the
   * supplier context's outletBranchId instead. They are still owned by the
   * supplier user, so the register/checkout guards authorize them normally, and
   * effective-user-role still derives POS_MANAGER from them. Null = ordinary
   * retail branch.
   */
  @Column({ type: 'int', nullable: true })
  supplierOutletProfileId?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
