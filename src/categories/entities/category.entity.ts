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
  AfterLoad,
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

  @AfterLoad()
  encodeIconUrl() {
    if (this.iconUrl) {
      const parts = this.iconUrl.split('?');
      const base = parts[0];
      const qs = parts.slice(1).join('?');

      const lastSlashIndex = base.lastIndexOf('/');
      if (lastSlashIndex !== -1) {
        const path = base.substring(0, lastSlashIndex + 1);
        const file = base.substring(lastSlashIndex + 1);
        // Ensure filename is strictly encoded (spaces, parens, &, etc)
        // Try to decode first to avoid double encoding if already partial
        let safeFile = file;
        try {
          safeFile = encodeURIComponent(decodeURIComponent(file));
        } catch {
          safeFile = encodeURIComponent(file);
        }
        this.iconUrl = `${path}${safeFile}${qs ? '?' + qs : ''}`;
      }
    }
  }

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
