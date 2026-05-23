import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('pos_hotel_night_audit_logs')
@Index(['branchId', 'auditDate'])
export class HotelNightAuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint', nullable: false })
  branchId: number;

  /** ISO date string (YYYY-MM-DD) of the night being audited */
  @Column({ type: 'varchar', length: 10, nullable: false })
  auditDate: string;

  /** How many OPEN folios were examined */
  @Column({ type: 'int', default: 0 })
  foliosProcessed: number;

  /** How many new ROOM_NIGHT charges were posted (skips idempotent duplicates) */
  @Column({ type: 'int', default: 0 })
  chargesPosted: number;

  /** Sum of all newly posted charge amounts */
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency: string;

  @Column({ type: 'bigint', nullable: true })
  triggeredByUserId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
