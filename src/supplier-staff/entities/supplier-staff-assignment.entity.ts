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
import { User } from '../../users/entities/user.entity';
import { SupplierProfile } from '../../suppliers/entities/supplier-profile.entity';

export enum SupplierStaffRole {
  MANAGER = 'MANAGER',
  OPERATOR = 'OPERATOR',
}

@Entity('supplier_staff_assignments')
@Unique(['supplierProfileId', 'userId'])
@Index(['userId', 'isActive'])
export class SupplierStaffAssignment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  supplierProfileId!: number;

  @ManyToOne(() => SupplierProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supplierProfileId' })
  supplierProfile!: SupplierProfile;

  @Column({ type: 'int' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'enum', enum: SupplierStaffRole })
  role!: SupplierStaffRole;

  @Column({ type: 'simple-array', default: '' })
  permissions!: string[];

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'int', nullable: true })
  invitedByUserId?: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
