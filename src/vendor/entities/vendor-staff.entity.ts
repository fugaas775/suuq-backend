import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { VendorPermission } from '../vendor-permissions.enum';

@Entity('vendor_staff')
@Unique(['member', 'vendor']) // Composite Unique Constraint: A user can't be added to same store twice
export class VendorStaff {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.employments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'memberId' })
  member: User;

  @Column()
  memberId: number;

  @ManyToOne(() => User, (user) => user.staff, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendorId' })
  vendor: User;

  @Column()
  vendorId: number;

  @Column('simple-array')
  permissions: VendorPermission[];

  @Column({ nullable: true })
  title: string; // e.g. "Store Manager", "Owner"

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
