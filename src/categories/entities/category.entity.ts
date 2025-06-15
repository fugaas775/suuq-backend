import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Tree,
  TreeChildren,
  TreeParent,
  OneToMany,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';

@Entity()
@Tree('closure-table', {
  ancestorColumnName: () => 'id_ancestor',
  descendantColumnName: () => 'id_descendant',
})
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ unique: true })
  slug!: string;

  @Column({ nullable: true })
  iconUrl?: string;

  @Column({ nullable: true })
  iconName?: string;

  @TreeChildren()
  children?: Category[];

  @TreeParent()
  parent?: Category;

  @OneToMany(() => Product, (product: Product) => product.category, { eager: false })
  products!: Product[];
}