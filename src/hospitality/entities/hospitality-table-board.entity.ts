import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pos_hospitality_table_board')
@Unique('uq_pos_hospitality_table_board_branch_table', ['branchId', 'tableId'])
@Index('idx_pos_hospitality_table_board_branch_updated', [
  'branchId',
  'updatedAt',
])
@Index('idx_pos_hospitality_table_board_branch_status', ['branchId', 'status'])
@Index('idx_pos_hospitality_table_board_branch_area', ['branchId', 'areaCode'])
export class HospitalityTableBoard {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 128 })
  tableId!: string;

  @Column({ type: 'varchar', length: 255 })
  tableLabel!: string;

  @Column({ type: 'varchar', length: 64, default: 'MAIN_ROOM' })
  areaCode!: string;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  status!: string;

  @Column({ type: 'int', default: 4 })
  seatCount!: number;

  @Column({ type: 'int', nullable: true })
  ownerUserId!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ownerReference!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ownerDisplayName!: string | null;

  @Column({ type: 'int', default: 0 })
  activeGuestCount!: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  activeBills!: Array<Record<string, unknown>>;

  @Column({
    type: 'jsonb',
    default: () => '\'{"ordered":0,"fired":0,"ready":0,"served":0}\'::jsonb',
  })
  courseSummary!: Record<string, number>;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
