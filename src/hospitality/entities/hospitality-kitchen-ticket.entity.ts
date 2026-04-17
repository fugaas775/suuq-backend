import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pos_hospitality_kitchen_tickets')
@Unique('uq_pos_hospitality_kitchen_ticket_branch_ticket', [
  'branchId',
  'ticketId',
])
@Index('idx_pos_hospitality_kitchen_ticket_branch_updated', [
  'branchId',
  'updatedAt',
])
@Index('idx_pos_hospitality_kitchen_ticket_branch_station', [
  'branchId',
  'stationCode',
])
@Index('idx_pos_hospitality_kitchen_ticket_branch_state', ['branchId', 'state'])
export class HospitalityKitchenTicket {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 128 })
  ticketId!: string;

  @Column({ type: 'varchar', length: 16 })
  serviceFormat!: string;

  @Column({ type: 'varchar', length: 32 })
  stationCode!: string;

  @Column({ type: 'varchar', length: 128 })
  stationLabel!: string;

  @Column({ type: 'varchar', length: 32 })
  state!: string;

  @Column({ type: 'timestamptz' })
  queuedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  firedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  readyAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  handedOffAt!: Date | null;

  @Column({ type: 'varchar', length: 255 })
  ticketLabel!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  receiptId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  serviceOwner!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  tableId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tableLabel!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  billId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  billLabel!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  lines!: Array<Record<string, unknown>> | null;

  @Column({ type: 'int', nullable: true })
  updatedByUserId!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  updatedByDisplayName!: string | null;

  @Column({ type: 'text', nullable: true })
  lastActionReason!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
