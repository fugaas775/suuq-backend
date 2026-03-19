import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { Branch } from './branch.entity';

export enum StockMovementType {
  PURCHASE_RECEIPT = 'PURCHASE_RECEIPT',
  TRANSFER = 'TRANSFER',
  SALE = 'SALE',
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity('stock_movements')
@Index(['branchId', 'productId', 'createdAt'])
export class StockMovement {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch!: Branch;

  @Column({ type: 'int' })
  productId!: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Column({ type: 'enum', enum: StockMovementType })
  movementType!: StockMovementType;

  @Column({ type: 'int' })
  quantityDelta!: number;

  @Column({ type: 'varchar', length: 64 })
  sourceType!: string;

  @Column({ type: 'int', nullable: true })
  sourceReferenceId?: number | null;

  @Column({ type: 'int', nullable: true })
  actorUserId?: number | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
