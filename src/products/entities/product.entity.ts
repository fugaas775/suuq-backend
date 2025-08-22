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

  // These getters are now removed as they are not needed.
  // The full, correct URL is now stored directly in `imageUrl` and in the `src` of the ProductImage entities.
}