import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Category } from '../../categories/entities/category.entity';
import { decimalColumnTransformer } from '../../common/utils/decimal.transformer';
import { ProductRequestOffer } from './product-request-offer.entity';
import { ProductRequestForward } from './product-request-forward.entity';

export enum ProductRequestStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum ProductRequestCondition {
  ANY = 'ANY',
  NEW = 'NEW',
  USED = 'USED',
}

export enum ProductRequestUrgency {
  FLEXIBLE = 'FLEXIBLE',
  THIS_WEEK = 'THIS_WEEK',
  IMMEDIATE = 'IMMEDIATE',
}

@Entity({ name: 'product_request' })
@Index('idx_product_request_status', ['status'])
@Index('idx_product_request_buyer', ['buyerId'])
@Index('idx_product_request_category', ['categoryId'])
export class ProductRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'buyer_id' })
  buyer!: User;

  @Column({ name: 'buyer_id', type: 'int' })
  buyerId!: number;

  @ManyToOne(() => Category, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: Category | null;

  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId?: number | null;

  @Column({ type: 'varchar', length: 180 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    name: 'budget_min',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalColumnTransformer,
  })
  budgetMin?: number | null;

  @Column({
    name: 'budget_max',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalColumnTransformer,
  })
  budgetMax?: number | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency?: string | null;

  @Column({
    type: 'enum',
    enum: ProductRequestCondition,
    enumName: 'product_request_condition_enum',
    default: ProductRequestCondition.ANY,
  })
  condition!: ProductRequestCondition;

  @Column({
    type: 'enum',
    enum: ProductRequestUrgency,
    enumName: 'product_request_urgency_enum',
    default: ProductRequestUrgency.FLEXIBLE,
  })
  urgency!: ProductRequestUrgency;

  @Column({
    name: 'preferred_city',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  preferredCity?: string | null;

  @Column({
    name: 'preferred_country',
    type: 'varchar',
    length: 2,
    nullable: true,
  })
  preferredCountry?: string | null;

  @Column({ name: 'image_url', type: 'varchar', length: 255, nullable: true })
  imageUrl?: string | null;

  @Column({
    type: 'enum',
    enum: ProductRequestStatus,
    enumName: 'product_request_status_enum',
    default: ProductRequestStatus.OPEN,
  })
  status!: ProductRequestStatus;

  @Column({ type: 'timestamp', nullable: true, name: 'expires_at' })
  expiresAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'closed_at' })
  closedAt?: Date | null;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'::jsonb" })
  metadata?: Record<string, any> | null;

  @OneToMany(() => ProductRequestOffer, (offer) => offer.request, {
    cascade: false,
  })
  offers?: ProductRequestOffer[];

  @OneToMany(() => ProductRequestForward, (forward) => forward.request, {
    cascade: false,
  })
  forwards?: ProductRequestForward[];

  @ManyToOne(() => ProductRequestOffer, { nullable: true })
  @JoinColumn({ name: 'accepted_offer_id' })
  acceptedOffer?: ProductRequestOffer | null;

  @Column({ name: 'accepted_offer_id', type: 'int', nullable: true })
  acceptedOfferId?: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Loaded via QueryBuilder relation count mapping when needed
  offerCount?: number;

  // Loaded via QueryBuilder relation count mapping when needed
  forwardedCount?: number;
}
