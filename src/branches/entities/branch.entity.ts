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
   * Brand logo URL for this branch (uploaded via /media). Shown in the register
   * branch badge across all service formats and on receipts. Null = no logo.
   */
  @Column({ type: 'varchar', length: 512, nullable: true })
  logoUrl?: string | null;

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
