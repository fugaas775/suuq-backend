import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { SupplierProfile } from '../../suppliers/entities/supplier-profile.entity';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value == null ? null : Number(value),
};

export enum SupplierOfferStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum SupplierAvailabilityStatus {
  IN_STOCK = 'IN_STOCK',
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

@Entity('supplier_offers')
@Index(['supplierProfileId', 'productId'])
export class SupplierOffer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  supplierProfileId!: number;

  @ManyToOne(() => SupplierProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplierProfileId' })
  supplierProfile!: SupplierProfile;

  @Column({ type: 'int' })
  productId!: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Column({
    type: 'enum',
    enum: SupplierOfferStatus,
    default: SupplierOfferStatus.DRAFT,
  })
  status!: SupplierOfferStatus;

  @Column({
    type: 'enum',
    enum: SupplierAvailabilityStatus,
    default: SupplierAvailabilityStatus.IN_STOCK,
  })
  availabilityStatus!: SupplierAvailabilityStatus;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  unitWholesalePrice!: number;

  @Column({ type: 'int', default: 1 })
  moq!: number;

  @Column({ type: 'int', default: 0 })
  leadTimeDays!: number;

  @Column({ type: 'text', array: true, default: '{}' })
  fulfillmentRegions!: string[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
