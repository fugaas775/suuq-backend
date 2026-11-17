import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** DRAFT is the office's; PUBLISHED is shown to teachers and families. */
export type SchoolExamTimetableStatus = 'DRAFT' | 'PUBLISHED';

/**
 * One exam a class sits: a subject, on a day, between two clock times.
 * `invigilator` is a name, free text — the office writes who stands in the
 * room, and that is often not the class's own teacher.
 */
export interface SchoolExamSitting {
  date: string; // 'YYYY-MM-DD'
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  classCode: string;
  subject: string;
  invigilator?: string | null;
}

/**
 * An exam timetable — "Mid Exam I", "Final Exam" — for the whole school.
 *
 * Asked for 2026-11-17 (SMAG + SMAQ, Mid Exam I from Monday 2026-11-23): two
 * exams a day per class from the class's shift start, 40 minutes each — 30 for
 * SMAQ's KG II. A DOCUMENT like the weekly timetable (one row per exam, its
 * sittings held whole and written whole), because it is drawn up, printed and
 * read as one thing, and a half-saved exam week is worse than none.
 */
@Entity('pos_school_exam_timetables')
@Index('idx_pos_school_exam_timetables_branch', ['branchId'])
export class SchoolExamTimetable {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** "Mid Exam I". Unique per branch, case-insensitively. */
  @Column({ type: 'varchar', length: 80 })
  title!: string;

  /** The first exam day, 'YYYY-MM-DD'. */
  @Column({ type: 'varchar', length: 10 })
  startsOn!: string;

  @Column({ type: 'varchar', length: 12, default: 'DRAFT' })
  status!: SchoolExamTimetableStatus;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  sittings!: SchoolExamSitting[];

  @Column({ type: 'varchar', length: 600, nullable: true })
  notes!: string | null;

  @Column({ type: 'int', nullable: true })
  updatedByUserId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
