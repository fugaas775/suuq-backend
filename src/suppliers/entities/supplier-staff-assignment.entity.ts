import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SupplierProfile } from './supplier-profile.entity';

/**
 * Roles inside a supplier (wholesaler) account. Mirrors BranchStaffRole for the
 * retailer/branch side: a MANAGER (owner-equivalent) can manage the team,
 * billing and fulfil orders; an OPERATOR can view the inbox but not fulfil.
 *
 * These map to the platform roles SUPPLIER_MANAGER / SUPPLIER_OPERATOR that the
 * onboarding/staff services grant on the User record.
 */
export enum SupplierStaffRole {
  MANAGER = 'MANAGER',
  OPERATOR = 'OPERATOR',
}

@Entity('supplier_staff_assignments')
@Unique(['supplierProfileId', 'userId'])
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

  /**
   * Comma-joined permission flags. Stored in the existing `permissions text`
   * column (default ''); mapped as simple-array to match BranchStaffAssignment
   * ergonomics.
   */
  @Column({ type: 'simple-array', default: '' })
  permissions!: string[];

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'int', nullable: true })
  invitedByUserId!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
