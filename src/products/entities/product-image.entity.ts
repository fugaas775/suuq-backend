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

  // Optional perceptual hash for visual similarity search (e.g., dHash 64-bit as hex)
  @Column({ nullable: true, length: 64 })
  phash?: string | null;

  @Column({ nullable: true, length: 16 })
  phashAlgo?: string | null; // e.g., 'dhash64'

  @ManyToOne(() => Product, (product) => product.images, {
    onDelete: 'CASCADE',
  })
  product!: Product;

  @CreateDateColumn()
  createdAt!: Date; // When the image was added
}
