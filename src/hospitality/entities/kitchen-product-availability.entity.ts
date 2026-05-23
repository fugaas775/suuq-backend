import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pos_kitchen_product_availability')
@Unique('uq_pos_kitchen_prod_avail_branch_product', ['branchId', 'productId'])
@Index('idx_pos_kitchen_prod_avail_branch', ['branchId'])
export class KitchenProductAvailability {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 128 })
  productId!: string;

  @Column({ type: 'boolean', default: false })
  available!: boolean;

  @Column({ type: 'int', nullable: true })
  qtyRemaining!: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
