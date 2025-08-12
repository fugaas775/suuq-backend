import {
  Entity, PrimaryGeneratedColumn, Column, Tree, TreeChildren, TreeParent, OneToMany, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { Exclude } from 'class-transformer'; // <-- Import Exclude

@Entity()
@Tree('closure-table')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ nullable: true })
  iconUrl?: string;

  @Column({ nullable: true })
  iconName?: string;

  // Optional explicit version to bust CDN cache when icon changes
  @Column({ type: 'int', default: 0 })
  iconVersion: number;
  
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @TreeChildren({ cascade: true }) // Added cascade for easier management
  children?: Category[];

  @TreeParent()
  parent?: Category;

  // --- THIS IS THE FIX ---
  // Exclude the direct products link from general serialization to prevent circular issues.
  // We can create a separate DTO later if we need to show products.
  @Exclude({ toPlainOnly: true })
  @OneToMany(() => Product, (product) => product.category)
  products: Product[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}