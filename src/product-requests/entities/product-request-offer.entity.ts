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
import { Product } from '../../products/entities/product.entity';
import { ProductRequest } from './product-request.entity';
import { decimalColumnTransformer } from '../../common/utils/decimal.transformer';

export enum ProductRequestOfferStatus {
  SENT = 'SENT',
  SEEN = 'SEEN',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  EXPIRED = 'EXPIRED',
}

@Entity({ name: 'product_request_offer' })
@Index('idx_product_request_offer_request', ['requestId'])
@Index('idx_product_request_offer_seller', ['sellerId'])
export class ProductRequestOffer {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => ProductRequest, (request) => request.offers, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'request_id' })
  request!: ProductRequest;

  @Column({ name: 'request_id', type: 'int' })
  requestId!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'seller_id' })
  seller!: User;

  @Column({ name: 'seller_id', type: 'int' })
  sellerId!: number;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product?: Product | null;

  @Column({ name: 'product_id', type: 'int', nullable: true })
  productId?: number | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalColumnTransformer,
  })
  price?: number | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency?: string | null;

  @Column({ type: 'text', nullable: true })
  message?: string | null;

  @Column({
    type: 'enum',
    enum: ProductRequestOfferStatus,
    enumName: 'product_request_offer_status_enum',
    default: ProductRequestOfferStatus.SENT,
  })
  status!: ProductRequestOfferStatus;

  @Column({ type: 'timestamp', nullable: true, name: 'expires_at' })
  expiresAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'seen_at' })
  seenAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'responded_at' })
  respondedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
