import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity()
export class ProductImage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  src!: string; // Full-res image URL or path

  @Column({ nullable: true })
  thumbnailSrc?: string; // Thumbnail image URL or path

  @Column({ nullable: true })
  lowResSrc?: string; // Low-res image URL or path

  @Column({ nullable: true })
  alt?: string; // Optional alt text for accessibility/SEO

  @Column({ nullable: true })
  sortOrder?: number; // For ordering images in the gallery

  @ManyToOne(() => Product, (product) => product.images, {
    onDelete: 'CASCADE',
  })
  product!: Product;

  @CreateDateColumn()
  createdAt!: Date; // When the image was added
}
