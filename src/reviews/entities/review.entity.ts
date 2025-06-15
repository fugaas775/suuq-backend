import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';

@Entity('reviews')
@Index(['product', 'user'], { unique: true })
export class Review {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', width: 1 })
  rating!: number;

  @Column({ type: 'text', nullable: false })
  comment!: string;

  @ManyToOne(() => Product, product => product.reviews, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @ManyToOne(() => User, user => user.reviews, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;
}