import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Branch } from '../../branches/entities/branch.entity';

export enum PartnerType {
  POS = 'POS',
  SUPPLIER = 'SUPPLIER',
  INTERNAL = 'INTERNAL',
}

export enum PartnerCredentialStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}

@Entity('partner_credentials')
export class PartnerCredential {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'enum', enum: PartnerType })
  partnerType!: PartnerType;

  @Column({ type: 'int', nullable: true })
  branchId?: number | null;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branchId' })
  branch?: Branch | null;

  @Column({ type: 'simple-array', default: '' })
  scopes!: string[];

  @Column({ type: 'varchar', length: 255 })
  keyHash!: string;

  @Column({
    type: 'enum',
    enum: PartnerCredentialStatus,
    default: PartnerCredentialStatus.ACTIVE,
  })
  status!: PartnerCredentialStatus;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  revokedByUserId?: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  revocationReason?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
