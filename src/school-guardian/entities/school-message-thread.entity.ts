import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type SchoolMessageSenderKind = 'GUARDIAN' | 'STAFF';

/**
 * One conversation about one child between the family's login and the
 * school — the class teacher, the subject teachers, the office: whoever on
 * the staff side may reach the child's class answers on it.
 *
 * Keyed (school, pupil, guardian): a family with two children has two
 * threads, and a child with two logins (a father's and a mother's) has one
 * per login, each reading only their own. The unread counters are per side:
 * a parent's reply raises the staff side's, a teacher's reply the family's,
 * and opening the thread clears the reader's own. `pupilName` and
 * `classCode` are denormalised for the list; the class is refreshed off the
 * folio whenever a message lands, so a transferred child's thread follows.
 */
@Entity('pos_school_message_threads')
@Unique('uq_pos_school_message_threads_pupil_guardian', [
  'branchId',
  'folioId',
  'guardianId',
])
@Index('idx_pos_school_message_threads_branch_last', [
  'branchId',
  'lastMessageAt',
])
@Index('idx_pos_school_message_threads_guardian', ['guardianId'])
export class SchoolMessageThread {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** The pupil's record — `pos_suspended_carts.id`. */
  @Column({ type: 'int' })
  folioId!: number;

  /** `pos_school_guardians.id` — the family's login at this school. */
  @Column({ type: 'bigint' })
  guardianId!: number;

  @Column({ type: 'varchar', length: 160, nullable: true })
  pupilName!: string | null;

  /** LOWERCASED, refreshed off the folio on every message. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  classCode!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  lastPreview!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  lastSenderKind!: SchoolMessageSenderKind | null;

  /** Messages from the school the family has not opened yet. */
  @Column({ type: 'int', default: 0 })
  guardianUnread!: number;

  /** Messages from the family nobody on the staff side has opened yet. */
  @Column({ type: 'int', default: 0 })
  staffUnread!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
