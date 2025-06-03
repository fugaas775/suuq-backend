import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, ManyToMany, JoinTable, CreateDateColumn } from 'typeorm';
import { User } from '../../users/user.entity';
import { Category } from '../../categories/category.entity';
import { Tag } from '../../tags/tag.entity';
import { ProductImage } from './product-image.entity';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column('decimal')
  price!: number;

  @Column()
  description!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ default: false })
  isBlocked!: boolean;

  @Column({ default: false })
  featured!: boolean;

  @ManyToOne(() => User, (user: User) => user.products, { eager: false })
  vendor!: User;

  
  @ManyToOne(() => Category, category => category.products, { nullable: true })
  category?: Category;

  @Column('decimal', { nullable: true })
  sale_price?: number;

  @Column({ nullable: true })
  currency?: string;

  @OneToMany(() => ProductImage, image => image.product, { cascade: true, eager: true })
  images!: ProductImage[];

  @Column('decimal', { nullable: true })
  average_rating?: number;

  @Column({ nullable: true })
  rating_count?: number;

  @ManyToMany(() => Tag, (tag) => tag.products, { cascade: true })
  @JoinTable()
  tags!: Tag[];

  }
