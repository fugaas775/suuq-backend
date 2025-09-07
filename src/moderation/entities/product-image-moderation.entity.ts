import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { ProductImage } from '../../products/entities/product-image.entity';
import { User } from '../../users/entities/user.entity';

export type ModerationStatus = 'pending' | 'flagged' | 'approved' | 'rejected';

@Entity({ name: 'product_image_moderation' })
@Index(['status'])
@Index(['productId'])
@Index(['productImageId'])
export class ProductImageModeration {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('int')
  productId!: number;

  @Column('int')
  productImageId!: number;

  @Column('text')
  imageUrl!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: ModerationStatus;

  @Column({ type: 'jsonb', nullable: true })
  labels?: any; // Raw labels from provider

  @Column('text', { array: true, nullable: true })
  matchedLabels?: string[] | null;

  @Column('real', { nullable: true })
  topConfidence?: number | null;

  @Column({ type: 'text', nullable: true })
  reason?: string | null; // admin rejection reason

  @Column({ type: 'text', nullable: true })
  appealMessage?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  appealedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  reviewedById?: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;

  @ManyToOne(() => Product, (p) => p.images, { onDelete: 'CASCADE' })
  product!: Product;

  @ManyToOne(() => ProductImage, { onDelete: 'CASCADE' })
  image!: ProductImage;

  @ManyToOne(() => User, { nullable: true })
  reviewedBy?: User | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
