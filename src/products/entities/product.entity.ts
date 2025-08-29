import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
} from 'typeorm';
import { Expose } from 'class-transformer';
import { User } from '../../users/entities/user.entity'; 
import { Category } from '../../categories/entities/category.entity';
import { Tag } from '../../tags/tag.entity';
import { ProductImage } from './product-image.entity';
import { Review } from '../../reviews/entities/review.entity';

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

  @Column('decimal', { precision: 10, scale: 2, transformer: {
    to: (value: number) => value,
    from: (value: string | number) => typeof value === 'string' ? parseFloat(value) : value
  }})
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

  @ManyToOne(() => User, user => user.products, { eager: false, nullable: false })
  vendor!: User;

  @ManyToOne(() => Category, category => category.products, { nullable: true })
  category?: Category;

  @Column('decimal', { precision: 10, scale: 2, nullable: true, transformer: {
    to: (value: number | undefined) => value,
    from: (value: string | number | undefined) => typeof value === 'string' ? parseFloat(value) : value
  }})
  sale_price?: number;

  @OneToMany(() => ProductImage, image => image.product, { cascade: true, eager: true })
  images!: ProductImage[];

  @Column('decimal', { precision: 3, scale: 2, nullable: true })
  average_rating?: number;

  @Column({ nullable: true })
  rating_count?: number;

  @ManyToMany(() => Tag, tag => tag.products, { cascade: true })
  @JoinTable()
  tags!: Tag[];

  @Column({ nullable: true })
  sku?: string;

  @Column('int', { nullable: true })
  stock_quantity?: number;

  @Column({ default: false })
  manage_stock?: boolean;

  @Column({ default: 'publish' })
  status?: 'publish' | 'draft' | 'pending';

  @OneToMany(() => Review, review => review.product)
  reviews!: Review[];

  // Per-product sales counter used for Best Sellers sorting
  @Column('int', { default: 0 })
  sales_count!: number;

  // Viewers counter for vendor analytics (DB column: view_count)
  @Column('int', { default: 0, name: 'view_count' })
  viewCount!: number;

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
  @Column({ type: 'varchar', length: 120, nullable: true, name: 'listing_city' })
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
  get rent_period_exposed(): 'day' | 'week' | 'month' | 'year' | null | undefined {
    return this.rentPeriod ?? null;
  }

  // Convenience alias: expose top-level videoUrl reading from attributes.videoUrl when set
  @Expose()
  get videoUrl(): string | undefined {
    const v = (this.attributes as any)?.videoUrl;
    return typeof v === 'string' ? v : undefined;
  }

  // Convenience for edit forms: list of tag names
  @Expose({ name: 'tag_names' })
  get tag_names(): string[] {
    return Array.isArray(this.tags) ? this.tags.map((t: any) => t?.name).filter(Boolean) : [];
  }

  // These getters are now removed as they are not needed.
  // The full, correct URL is now stored directly in `imageUrl` and in the `src` of the ProductImage entities.
}