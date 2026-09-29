import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Homework — set by the teacher for a class, read by the families on the
 * parents' portal.
 *
 * Keyed to the class (lowercased, as every SCHOOL reader keys it) and the
 * subject, so a Mathematics teacher's homework for 3aad reaches every family
 * with a child in 3aad. `teacherName` is denormalised like every other
 * register's name: the entry must still say who set it after that person
 * leaves. No foreign keys, by the same rule. The teacher takes it down
 * (isActive) rather than deleting what a family may already have read.
 */
@Entity('pos_school_homework')
@Index('idx_pos_school_homework_branch_class', ['branchId', 'classCode'])
@Index('idx_pos_school_homework_branch_due', ['branchId', 'dueOn'])
export class SchoolHomework {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** LOWERCASED class code. */
  @Column({ type: 'varchar', length: 64 })
  classCode!: string;

  @Column({ type: 'varchar', length: 120 })
  subject!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  /** The day it is due, YYYY-MM-DD; null = no date given. */
  @Column({ type: 'date', nullable: true })
  dueOn!: string | null;

  /** `pos_branch_employees.id` of the teacher who set it, when known. */
  @Column({ type: 'int', nullable: true })
  employeeId!: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  teacherName!: string | null;

  @Column({ type: 'int', nullable: true })
  createdByUserId!: number | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
