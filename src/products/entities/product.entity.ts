import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
  AfterLoad,
} from 'typeorm';
import { Expose } from 'class-transformer';
import { User } from '../../users/entities/user.entity';
import { Category } from '../../categories/entities/category.entity';
import { Tag } from '../../tags/tag.entity';
import { ProductImage } from './product-image.entity';
import { Review } from '../../reviews/entities/review.entity';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeDigitalAttributes } from '../../common/utils/digital.util';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  // ✨ THE FINAL, DEFINITIVE FIX
  // This was pointing to your API URL, not your media URL. It is now corrected.
  @Expose()
  @Column({ type: 'text', nullable: true })
  imageUrl: string | null;

  @Expose()
  get thumbnail(): string | null {
    // Optimized: prefer the generated thumbnail from the images relation.
    // This ensures list views don't download full-res images (imageUrl).
    if (this.images && this.images.length > 0) {
      const img = this.images[0];
      return img.thumbnailSrc || img.src;
    }
    return this.imageUrl || null;
  }

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) =>
        typeof value === 'string' ? parseFloat(value) : value,
    },
  })
  price!: number;

  @Column({ length: 3 })
  currency!: string;

  @Column()
  description!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ default: false })
  isBlocked!: boolean;

  @Column({ default: false })
  featured!: boolean;

  @ManyToOne(() => User, (user) => user.products, {
    eager: false,
    nullable: false,
  })
  vendor!: User;

  @ManyToOne(() => Category, (category) => category.products, {
    nullable: true,
  })
  category?: Category;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number | undefined) => value,
      from: (value: string | number | undefined) =>
        typeof value === 'string' ? parseFloat(value) : value,
    },
  })
  sale_price?: number;

  @OneToMany(() => ProductImage, (image) => image.product, {
    cascade: true,
    eager: true,
  })
  images!: ProductImage[];

  @Column('decimal', { precision: 3, scale: 2, nullable: true })
  average_rating?: number;

  @Column({ nullable: true })
  rating_count?: number;

  @Column({ type: 'json', nullable: true, select: false })
  original_creator_contact?: Record<string, any>;

  @ManyToMany(() => Tag, (tag) => tag.products, { cascade: true })
  @JoinTable()
  tags!: Tag[];

  @Column({ nullable: true })
  sku?: string;

  @Column('int', { nullable: true })
  stock_quantity?: number;

  @Column({ default: false })
  manage_stock?: boolean;

  @Column({ default: 'publish' })
  status?: 'publish' | 'draft' | 'pending' | 'pending_approval' | 'rejected';

  @OneToMany(() => Review, (review) => review.product)
  reviews!: Review[];

  // Per-product sales counter used for Best Sellers sorting
  @Column('int', { default: 0 })
  sales_count!: number;

  // Viewers counter for vendor analytics (DB column: view_count)
  @Column('int', { default: 0, name: 'view_count' })
  viewCount!: number;

  // Product type classification (physical, digital, service, property)
  @ApiProperty({
    enum: ['physical', 'digital', 'service', 'property'],
    required: false,
  })
  @Expose()
  @Column({
    type: 'varchar',
    length: 16,
    name: 'product_type',
    nullable: true,
    default: 'physical',
  })
  productType?: 'physical' | 'digital' | 'service' | 'property' | null;

  // Listing type for property verticals: 'sale' | 'rent'
  @Expose()
  @Column({ type: 'varchar', length: 10, nullable: true, name: 'listing_type' })
  listingType?: 'sale' | 'rent' | null;

  // Bedrooms for property listings
  @Expose()
  @Column('int', { nullable: true, name: 'bedrooms' })
  bedrooms?: number | null;

  // Property listing city (per-listing, not vendor profile)
  @Expose()
  @Column({
    type: 'varchar',
    length: 120,
    nullable: true,
    name: 'listing_city',
  })
  listingCity?: string | null;

  // Bathrooms for property listings
  @Expose()
  @Column('int', { nullable: true, name: 'bathrooms' })
  bathrooms?: number | null;

  // Size in square meters
  @Expose()
  @Column('int', { nullable: true, name: 'size_sqm' })
  sizeSqm?: number | null;

  // Furnished flag
  @Expose()
  @Column('boolean', { nullable: true, name: 'furnished' })
  furnished?: boolean | null;

  // Rent period for rentals
  @Expose()
  @Column({ type: 'varchar', length: 16, nullable: true, name: 'rent_period' })
  rentPeriod?: 'day' | 'week' | 'month' | 'year' | null;

  // Arbitrary attributes (e.g., videoUrl)
  @Expose()
  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'::jsonb" })
  attributes?: Record<string, any> | null;

  // --- Common API aliases for clients ---
  @Expose({ name: 'view_count' })
  get view_count(): number {
    return this.viewCount;
  }
  @Expose({ name: 'views' })
  get views(): number {
    return this.viewCount;
  }
  @Expose({ name: 'views_count' })
  get views_count(): number {
    return this.viewCount;
  }
  @Expose({ name: 'impressions' })
  get impressions(): number {
    return this.viewCount;
  }
  @Expose({ name: 'hits' })
  get hits(): number {
    return this.viewCount;
  }

  @Expose({ name: 'listing_type' })
  get listing_type(): 'sale' | 'rent' | null | undefined {
    return this.listingType ?? null;
  }

  @Expose({ name: 'bedrooms' })
  get bedrooms_exposed(): number | null | undefined {
    return this.bedrooms ?? null;
  }

  @Expose({ name: 'listing_city' })
  get listing_city_exposed(): string | null | undefined {
    return this.listingCity ?? null;
  }

  @Expose({ name: 'bathrooms' })
  get bathrooms_exposed(): number | null | undefined {
    return this.bathrooms ?? null;
  }

  @Expose({ name: 'size_sqm' })
  get size_sqm_exposed(): number | null | undefined {
    return this.sizeSqm ?? null;
  }

  @Expose({ name: 'furnished' })
  get furnished_exposed(): boolean | null | undefined {
    return this.furnished ?? null;
  }

  @Expose({ name: 'rent_period' })
  get rent_period_exposed():
    | 'day'
    | 'week'
    | 'month'
    | 'year'
    | null
    | undefined {
    return this.rentPeriod ?? null;
  }

  // Convenience alias: expose top-level videoUrl reading from attributes.videoUrl when set
  @Expose()
  get videoUrl(): string | undefined {
    const attrs = this.attributes;
    if (!attrs || typeof attrs !== 'object') return undefined;
    const v = (attrs as Record<string, unknown>).videoUrl;
    return typeof v === 'string' ? v : undefined;
  }

  // Expose poster thumbnail URL for video if present in attributes
  @Expose()
  get posterUrl(): string | undefined {
    const attrs = this.attributes;
    if (!attrs || typeof attrs !== 'object') return undefined;
    const v =
      (attrs as Record<string, unknown>).posterUrl ?? (attrs as any).posterSrc;
    return typeof v === 'string' ? v : undefined;
  }

  // Alias for some clients
  @Expose()
  get videoPosterUrl(): string | undefined {
    return this.posterUrl;
  }

  // --- Admin deletion metadata (soft delete support) ---
  @Expose()
  @Column({ type: 'timestamp', nullable: true, name: 'deleted_at' })
  deletedAt?: Date | null;

  @Expose()
  @Column({ type: 'int', nullable: true, name: 'deleted_by_admin_id' })
  deletedByAdminId?: number | null;

  @Expose()
  @Column({
    type: 'varchar',
    length: 512,
    nullable: true,
    name: 'deleted_reason',
  })
  deletedReason?: string | null;

  // Convenience: expose digital download key (object key), if present. Not intended for public clients.
  @Expose()
  get downloadKey(): string | undefined {
    const attrs = this.attributes;
    if (!attrs || typeof attrs !== 'object') return undefined;
    const v = (attrs as Record<string, unknown>).downloadKey;
    return typeof v === 'string' ? v : undefined;
  }

  // Convenience: expose free flag for digital items
  @Expose()
  get isFree(): boolean | undefined {
    const attrs = this.attributes;
    if (!attrs || typeof attrs !== 'object') return undefined;
    const v = (attrs as Record<string, unknown>).isFree as any;
    return typeof v === 'boolean' ? v : undefined;
  }

  // Convenience for edit forms: list of tag names
  @Expose({ name: 'tag_names' })
  get tag_names(): string[] {
    if (!Array.isArray(this.tags)) return [];
    const out: string[] = [];
    for (const t of this.tags) {
      const name = (t as unknown as { name?: unknown })?.name;
      if (typeof name === 'string') out.push(name);
    }
    return out;
  }

  // These getters are now removed as they are not needed.
  // The full, correct URL is now stored directly in `imageUrl` and in the `src` of the ProductImage entities.

  // Hydrate legacy Property & Real Estate fields from attributes on entity load for better prefill
  @AfterLoad()
  hydratePropertyFieldsFromAttributes() {
    const attrs =
      this.attributes && typeof this.attributes === 'object'
        ? this.attributes
        : undefined;
    if (!attrs) return;

    const pickString = (...keys: string[]): string | undefined => {
      for (const k of keys) {
        const v = attrs[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      return undefined;
    };
    const pickNumber = (...keys: string[]): number | undefined => {
      for (const k of keys) {
        const v = attrs[k];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string') {
          const n = Number(v);
          if (Number.isFinite(n)) return n;
        }
      }
      return undefined;
    };
    const pickBoolean = (...keys: string[]): boolean | undefined => {
      for (const k of keys) {
        const v = attrs[k];
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') {
          const s = v.trim().toLowerCase();
          if (['true', 'yes', '1'].includes(s)) return true;
          if (['false', 'no', '0'].includes(s)) return false;
        }
        if (typeof v === 'number') return v !== 0;
      }
      return undefined;
    };

    // listingType: 'sale' | 'rent'
    if (this.listingType == null) {
      const ltRaw = pickString(
        'listingType',
        'listing_type',
        'type',
        'sale_or_rent',
      );
      const lt = ltRaw ? ltRaw.toLowerCase() : undefined;
      if (lt === 'sale' || lt === 'sell') this.listingType = 'sale' as any;
      else if (lt === 'rent' || lt === 'rental')
        this.listingType = 'rent' as any;
    }
    // listingCity
    if (this.listingCity == null) {
      const city = pickString(
        'listingCity',
        'listing_city',
        'city',
        'location',
        'area',
      );
      if (city) this.listingCity = city;
    }
    // bedrooms
    if (this.bedrooms == null) {
      const n = pickNumber('bedrooms', 'beds');
      if (typeof n === 'number') this.bedrooms = n;
    }
    // bathrooms
    if (this.bathrooms == null) {
      const n = pickNumber('bathrooms', 'baths', 'washrooms');
      if (typeof n === 'number') this.bathrooms = n;
    }
    // sizeSqm
    if (this.sizeSqm == null) {
      const n = pickNumber(
        'sizeSqm',
        'size_sqm',
        'sqm',
        'area',
        'size',
        'plot_area',
      );
      if (typeof n === 'number') this.sizeSqm = n;
    }
    // furnished
    if (this.furnished == null) {
      const b = pickBoolean('furnished', 'is_furnished');
      if (typeof b === 'boolean') this.furnished = b;
    }
    // rentPeriod: 'day' | 'week' | 'month' | 'year'
    if (this.rentPeriod == null) {
      const raw = pickString(
        'rentPeriod',
        'rent_period',
        'period',
        'rent_frequency',
      );
      if (raw) {
        const s = raw.toLowerCase();
        if (['day', 'daily'].includes(s)) this.rentPeriod = 'day' as any;
        else if (['week', 'weekly'].includes(s))
          this.rentPeriod = 'week' as any;
        else if (['month', 'monthly'].includes(s))
          this.rentPeriod = 'month' as any;
        else if (['year', 'yearly', 'annually', 'annual'].includes(s))
          this.rentPeriod = 'year' as any;
      }
    }
  }

  // Second AfterLoad hook to normalize digital schema & derive productType
  @AfterLoad()
  private hydrateDigitalSchema() {
    try {
      const attrs =
        this.attributes && typeof this.attributes === 'object'
          ? { ...(this.attributes as any) }
          : {};
      const { updated, changed, inferredType } =
        normalizeDigitalAttributes(attrs);
      if (changed) this.attributes = updated;
      // Derive productType if not explicitly set
      if (!this.productType) {
        if (inferredType === 'digital') this.productType = 'digital';
        else if (this.listingType || this.listingCity || this.bedrooms != null)
          this.productType = 'property';
        else this.productType = 'physical';
      }
    } catch {
      // ignore normalization errors; leave attributes untouched
    }
  }
}
