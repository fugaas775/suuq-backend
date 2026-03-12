import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
