import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum HotelFolioStatus {
  OPEN = 'OPEN',
  SETTLED = 'SETTLED',
  VOIDED = 'VOIDED',
}

@Entity('pos_hotel_folios')
@Index('idx_pos_hotel_folio_branch_status', ['branchId', 'status'])
@Index('idx_pos_hotel_folios_local_ref', ['localRef'])
@Index('idx_pos_hotel_folio_branch_created', ['branchId', 'createdAt'])
export class HotelFolio {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** Client-side local suspended-cart id (e.g. 'folio-local-92') */
  @Column({ type: 'varchar', length: 255, nullable: true })
  localRef!: string | null;

  @Column({ type: 'varchar', length: 16, default: HotelFolioStatus.OPEN })
  status!: HotelFolioStatus;

  @Column({ type: 'varchar', length: 64 })
  roomNumber!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  guestName!: string | null;

  @Column({ type: 'date', nullable: true })
  checkInAt!: string | null;

  @Column({ type: 'date', nullable: true })
  checkOutAt!: string | null;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  chargesTotal!: number;

  /** Backend checkout id after settlement */
  @Column({ type: 'varchar', length: 128, nullable: true })
  settledCheckoutId!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  paidAmount!: number | null;

  @Column({ type: 'text', nullable: true })
  voidReason!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  transferredToRoom!: string | null;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'int', nullable: true })
  openedByUserId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  voidedAt!: Date | null;
}
