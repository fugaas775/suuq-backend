import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SchoolStaffNoticeAudience = 'ALL' | 'PEOPLE';

/**
 * A message from the heads to the staff — to one teacher, to several, or to
 * everybody on the staff list. Read on the person's own page, where "I have
 * read this" writes their staff-row id into `readBy`, so the office sees who
 * has and who has not.
 *
 * The people are `pos_branch_employees` rows, as warnings and leave are. No
 * foreign keys, by the same rule. Never deleted: taken down (`isActive`)
 * stays on the office's list as taken down.
 */
@Entity('pos_school_staff_notices')
@Index('idx_pos_school_staff_notices_branch_created', ['branchId', 'createdAt'])
export class SchoolStaffNotice {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title!: string | null;

  @Column({ type: 'text' })
  body!: string;

  /** ALL — everybody on the staff list; PEOPLE — the rows in `employeeIds`. */
  @Column({ type: 'varchar', length: 16, default: 'ALL' })
  audience!: SchoolStaffNoticeAudience;

  @Column({ type: 'jsonb', nullable: true })
  employeeIds!: number[] | null;

  /** Staff-row id → the ISO moment that person said they had read it. */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  readBy!: Record<string, string>;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', nullable: true })
  createdByUserId!: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  createdByName!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
