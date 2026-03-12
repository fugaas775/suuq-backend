import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum SupplierOnboardingStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('supplier_profiles')
export class SupplierProfile {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar', length: 255 })
  companyName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  legalName?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  taxId?: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  countriesServed!: string[];

  @Column({
    type: 'enum',
    enum: SupplierOnboardingStatus,
    default: SupplierOnboardingStatus.DRAFT,
  })
  onboardingStatus!: SupplierOnboardingStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payoutDetails?: string | null;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
