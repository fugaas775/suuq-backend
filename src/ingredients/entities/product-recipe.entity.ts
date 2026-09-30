import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Ingredient, decimalTransformer } from './ingredient.entity';

/**
 * One line of a menu item's recipe: how much of one ingredient ONE sold unit
 * of the product consumes, in the ingredient's unit.
 *
 * Per branch, not per product, because a product may be shared across a
 * vendor's branches while each kitchen keeps its own shelf. Whole recipes are
 * replaced as a set (see IngredientsService.replaceRecipe) — a recipe is one
 * document, and a partial patch would need stable line ids the editor does
 * not have.
 */
@Entity('pos_product_recipes')
@Unique('uq_pos_product_recipes_line', ['branchId', 'productId', 'ingredientId'])
@Index('idx_pos_product_recipes_branch_product', ['branchId', 'productId'])
export class ProductRecipe {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'int' })
  productId!: number;

  @Column({ type: 'int' })
  ingredientId!: number;

  @ManyToOne(() => Ingredient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ingredientId' })
  ingredient?: Ingredient;

  @Column('decimal', {
    precision: 14,
    scale: 4,
    transformer: decimalTransformer,
  })
  quantity!: number;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
