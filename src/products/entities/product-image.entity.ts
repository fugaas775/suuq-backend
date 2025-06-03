import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Product } from './product.entity';

@Entity()
export class ProductImage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  src!: string; // The actual image URL or path

  @Column({ nullable: true })
  alt?: string; // Optional alt text for accessibility/SEO

  @Column({ nullable: true })
  sortOrder?: number; // Optional: for ordering images in the product gallery

  @ManyToOne(() => Product, product => product.images, { onDelete: 'CASCADE' })
  product!: Product;

  @CreateDateColumn()
  createdAt!: Date; // Optional: track when image was added
}
