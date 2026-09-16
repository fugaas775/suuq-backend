import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 'LESSON' is a teaching period; 'BREAK' is on the bell but never on a slot. */
export type SchoolTimetablePeriodKind = 'LESSON' | 'BREAK';

/** Start/end on a 24-hour clock, 'HH:MM'. */
export interface SchoolTimetableTimes {
  start: string | null;
  end: string | null;
}

/**
 * One row of the bell schedule — P1, P2, Break, P4…
 *
 * `times` is keyed by SHIFT code, because a two-shift school rings the same
 * bell twice: SMAQ's P1 is 8:00 for the morning classes and 2:00 for the
 * afternoon ones. A single-shift school keys everything under `'*'`.
 *
 * `days` lists the ISO weekdays (1 = Monday) this period runs on. Friday in
 * both live schools ends after P4, which is why it is per period and not a
 * school-wide "periods per day".
 */
export interface SchoolTimetablePeriod {
  code: string;
  label: string | null;
  kind: SchoolTimetablePeriodKind;
  sortOrder: number;
  days: number[];
  times: Record<string, SchoolTimetableTimes>;
}

/** A shift and the classes that sit in it. Empty when a school runs one. */
export interface SchoolTimetableShift {
  code: string;
  label: string | null;
  classCodes: string[];
}

/**
 * One lesson: a class, a day, a period, a subject, and who teaches it.
 *
 * `employeeId` joins `pos_branch_employees` when the teacher is on the branch's
 * employment register; `teacherName` is what the timetable PRINTS and is kept
 * even when the join resolves, so a teacher who leaves does not blank the
 * slots they used to hold — the same denormalisation the attendance register
 * uses for `subjectName`. A slot naming nobody is a vacancy, not an error:
 * SMAQ's science post was advertised before it was filled, and the timetable
 * had to carry 24 periods for "Teacher X" until it was.
 */
export interface SchoolTimetableSlot {
  day: number;
  period: string;
  classCode: string;
  subject: string;
  teacherName: string | null;
  employeeId: number | null;
  room: string | null;
}

/**
 * A school's weekly period schedule — one document per branch.
 *
 * A document rather than a slot-per-row table, on purpose. The whole week is
 * always read together (a class grid, a teacher grid and the load count all
 * need every slot) and always WRITTEN together — a timetable is rebuilt when a
 * teacher joins or leaves, and half a week saved before the tablet dropped its
 * connection is worse than the old week intact. One row also makes "replace
 * the week" one UPDATE, which is what the office does each September.
 *
 * The questions a per-row table would answer better ("who is free Monday P2")
 * are answered over ~300 slots in memory faster than a round trip, and the
 * service refuses the two conflicts that matter — a class with two lessons in
 * one period, and a teacher in two rooms at once — before the row is saved.
 *
 * Class codes are stored in the registry's own spelling (`pos_school_classes`)
 * so every reader keys on the same string the folios and the attendance
 * register already use.
 */
@Entity('pos_school_timetables')
@Index('uq_pos_school_timetables_branch', ['branchId'], { unique: true })
export class SchoolTimetable {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** e.g. 'Weekly period schedule 2019 E.C.' */
  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  periods!: SchoolTimetablePeriod[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  shifts!: SchoolTimetableShift[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  slots!: SchoolTimetableSlot[];

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  updatedByUserId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
