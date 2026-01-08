import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Tree,
  TreeChildren,
  TreeParent,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { Exclude, Expose } from 'class-transformer'; // <-- Import Exclude

@Entity()
@Tree('closure-table')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  name: string;

  @Column({ unique: true })
  slug: string;

  // e.g. { "am": "ቤት", "fr": "Maison" }
  @Expose()
  @Column({ name: 'name_translations', type: 'jsonb', nullable: true })
  nameTranslations?: Record<string, string> | null;

  @Column({ nullable: true })
  iconUrl?: string;

  @Column({ nullable: true })
  iconName?: string;

  // Optional explicit version to bust CDN cache when icon changes
  @Column({ type: 'int', default: 0 })
  iconVersion: number;

  @Column({ type: 'int', default: 0 })
  @Index()
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
