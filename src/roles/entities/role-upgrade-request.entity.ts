import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../auth/roles.enum';

export enum RoleUpgradeStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export interface UpgradeDocument {
  url: string;
  name: string;
}

@Entity('role_upgrade_request')
export class RoleUpgradeRequest {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  @Index()
  user!: User;

  @Column({ type: 'text', array: true, enum: UserRole })
  roles!: UserRole[]; // requested roles

  @Column({ type: 'varchar', length: 2, nullable: true })
  country?: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  phoneCountryCode?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phoneNumber?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  storeName?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  businessLicenseNumber?: string | null;

  @Column({ type: 'jsonb', nullable: true, default: '[]' })
  documents?: UpgradeDocument[] | null;

  @Column({ type: 'enum', enum: RoleUpgradeStatus, default: RoleUpgradeStatus.PENDING })
  status!: RoleUpgradeStatus;

  @Column({ type: 'text', nullable: true })
  decisionReason?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  decidedBy?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
