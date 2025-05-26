// src/categories/category.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, Tree, TreeChildren, TreeParent, TreeRepository, OneToMany } from 'typeorm';
import { Product } from '../products/entities/product.entity';

@Entity()
@Tree('closure-table')
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ unique: true })
  slug!: string;

  @Column({ nullable: true })
  iconUrl?: string;

  @TreeChildren()
  children?: Category[];

  @TreeParent()
  parent?: Category;

  @OneToMany(() => Product, (product) => product.category, { eager: false })
  products!: Product[];
}
