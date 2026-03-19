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
import { Branch } from '../../branches/entities/branch.entity';
import { PartnerCredential } from '../../partner-credentials/entities/partner-credential.entity';
import { Product } from '../../products/entities/product.entity';
import { RetailTenant } from '../../retail/entities/retail-tenant.entity';

export enum ProductAliasType {
  LOCAL_SKU = 'LOCAL_SKU',
  BARCODE = 'BARCODE',
  GTIN = 'GTIN',
  EXTERNAL_PRODUCT_ID = 'EXTERNAL_PRODUCT_ID',
}

@Entity('product_aliases')
@Index(['tenantId', 'aliasType', 'normalizedAliasValue'])
@Index(['branchId', 'aliasType', 'normalizedAliasValue'])
@Index(['partnerCredentialId', 'aliasType', 'normalizedAliasValue'])
export class ProductAlias {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  tenantId!: number;

  @ManyToOne(() => RetailTenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant!: RetailTenant;

  @Column({ type: 'int', nullable: true })
  branchId?: number | null;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch?: Branch | null;

  @Column({ type: 'int', nullable: true })
  partnerCredentialId?: number | null;

  @ManyToOne(() => PartnerCredential, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'partnerCredentialId' })
  partnerCredential?: PartnerCredential | null;

  @Column({ type: 'int' })
  productId!: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Column({ type: 'enum', enum: ProductAliasType })
  aliasType!: ProductAliasType;

  @Column({ type: 'varchar', length: 255 })
  aliasValue!: string;

  @Column({ type: 'varchar', length: 255 })
  normalizedAliasValue!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
