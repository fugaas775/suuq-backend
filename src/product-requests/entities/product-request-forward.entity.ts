import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProductRequest } from './product-request.entity';

@Entity({ name: 'product_request_forward' })
@Index('idx_product_request_forward_request', ['requestId'])
@Index('idx_product_request_forward_vendor', ['vendorId'])
export class ProductRequestForward {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => ProductRequest, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request!: ProductRequest;

  @Column({ name: 'request_id', type: 'int' })
  requestId!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'vendor_id' })
  vendor!: User;

  @Column({ name: 'vendor_id', type: 'int' })
  vendorId!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'forwarded_by_admin_id' })
  forwardedByAdmin!: User;

  @Column({ name: 'forwarded_by_admin_id', type: 'int' })
  forwardedByAdminId!: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  channel?: string | null;

  @CreateDateColumn({ name: 'forwarded_at' })
  forwardedAt!: Date;
}
