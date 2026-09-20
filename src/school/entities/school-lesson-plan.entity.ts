import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type LessonPlanStatus =
  | 'PLANNED'
  | 'TAUGHT'
  | 'PARTLY'
  | 'POSTPONED'
  | 'CANCELLED';

/**
 * One lesson's plan: what a teacher means to teach in one slot of their
 * timetable, and what became of it.
 *
 * Keyed to the lesson (teacher, day, period, class) the way a lesson
 * attendance mark is — the timetable is the spine both hang on. The
 * teacher writes it and marks its status; the director, the deputy or the
 * owner sign it off. `teacherName` is denormalised like every other
 * register's name: a plan must still say whose it was after that person
 * leaves. No foreign keys, by the same rule.
 */
@Entity('pos_school_lesson_plans')
@Index('idx_pos_school_lesson_plans_branch_date', ['branchId', 'lessonDate'])
@Index('idx_pos_school_lesson_plans_branch_employee', [
  'branchId',
  'employeeId',
])
export class SchoolLessonPlan {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** `pos_branch_employees.id` — the teacher. */
  @Column({ type: 'int' })
  employeeId!: number;

  @Column({ type: 'varchar', length: 160, nullable: true })
  teacherName!: string | null;

  @Column({ type: 'date' })
  lessonDate!: string;

  /** 'P1', as the timetable spells it. */
  @Column({ type: 'varchar', length: 16 })
  periodCode!: string;

  /** LOWERCASED, like every SCHOOL reader keys a class. */
  @Column({ type: 'varchar', length: 64 })
  classCode!: string;

  @Column({ type: 'varchar', length: 120 })
  subject!: string;

  @Column({ type: 'varchar', length: 200 })
  topic!: string;

  @Column({ type: 'text', nullable: true })
  objectives!: string | null;

  @Column({ type: 'text', nullable: true })
  activities!: string | null;

  @Column({ type: 'text', nullable: true })
  materials!: string | null;

  @Column({ type: 'text', nullable: true })
  assessment!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'PLANNED' })
  status!: LessonPlanStatus;

  @Column({ type: 'date', nullable: true })
  taughtOn!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  statusNote!: string | null;

  @Column({ type: 'int', nullable: true })
  reviewedByUserId!: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  reviewedByName!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  reviewComment!: string | null;

  @Column({ type: 'int', nullable: true })
  createdByUserId!: number | null;

  @Column({ type: 'int', nullable: true })
  updatedByUserId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
