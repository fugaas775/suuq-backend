import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('pos_hotel_folio_charges')
@Index('idx_pos_hotel_folio_charge_folio', ['folioId'])
@Index('idx_pos_hotel_folio_charge_branch_created', ['branchId', 'createdAt'])
export class HotelFolioCharge {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  folioId!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  chargeGroupCode!: string | null;

  @Column({ type: 'varchar', length: 255 })
  chargeName!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  idempotencyKey!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
