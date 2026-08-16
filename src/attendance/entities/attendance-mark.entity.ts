import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Who the mark is about.
 *
 * One table rather than two, because a pupil's register and a teacher's register
 * are the same document: the same four states, the same day key, the same
 * monthly arithmetic, taken by the same office on the same morning. Splitting
 * them would duplicate the summary query and let the two drift.
 *
 * What differs is who may READ them, and that is expressed as two controllers
 * over one service — not as two tables.
 */
export enum AttendanceSubjectType {
  /** A pupil. `subjectRef` is their `pos_suspended_carts.id`. */
  STUDENT = 'STUDENT',
  /** An employee. `subjectRef` is their `pos_branch_employees.id`. */
  STAFF = 'STAFF',
}

/**
 * The four states a day can be in.
 *
 * `EXCUSED` carries two vocabularies — "Excused" for a child, "Leave" for a
 * member of staff — and that is a rendering decision, made once in the frontend.
 * A fifth code meaning the same thing would have to be folded back together in
 * every count, every export and every rate.
 *
 * There is deliberately no UNMARKED member. An absent row and an absent RECORD
 * are different facts: the first says the child was not there, the second says
 * nobody took the register. Storing "unmarked" would make the second
 * indistinguishable from the first, and a school with a forgotten Tuesday would
 * report a roll of truants.
 */
export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  EXCUSED = 'EXCUSED',
}

/**
 * One person, one day, one mark.
 *
 * ── Why this is a table and not a folio field ──────────────────────────────
 * A pupil's marks live in `cartSnapshot.schoolAcademicRecord`, because a pupil
 * has no other record and a term's results are a bounded document. Attendance
 * cannot follow it, for three reasons that module already names as the cost of
 * its own choice:
 *
 *   - HALF THE FEATURE HAS NO FOLIO. An employee is a `pos_branch_employees`
 *     row. There is nowhere on it to put a year of days.
 *   - IT IS UNBOUNDED IN TIME. 242 pupils over a 200-day year is ~48,000 marks.
 *     `MAX_REPORTS`/`MAX_SUBJECTS` exist precisely to stop that snapshot growing
 *     without limit, and every fee payment rewrites the whole JSON.
 *   - THE QUESTIONS ARE THE WRONG SHAPE. "Who is absent in 4aad today" is one
 *     indexed read here and a crawl of every folio in the school otherwise.
 *
 * It also puts the register out of reach of the snapshot-rebuild trap: the
 * register save path cannot erase what it never carried.
 *
 * ── The date column ────────────────────────────────────────────────────────
 * `attendanceDate` is a DATE, not a timestamp. A school day is a calendar day in
 * the school's own town; it has no instant and no zone. A naive `timestamp`
 * here would read hours early for an Ethiopian branch and put the register on
 * the wrong day — the failure this codebase has already had once.
 */
@Entity('pos_branch_attendance')
@Index(
  'uq_pos_branch_attendance_subject_day',
  ['branchId', 'subjectType', 'subjectRef', 'attendanceDate'],
  { unique: true },
)
@Index('idx_pos_branch_attendance_branch_type_date', [
  'branchId',
  'subjectType',
  'attendanceDate',
])
@Index('idx_pos_branch_attendance_class_date', [
  'branchId',
  'classCode',
  'attendanceDate',
])
export class AttendanceMark {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** The school day, as the school's own calendar names it. */
  @Column({ type: 'date' })
  attendanceDate!: string;

  @Column({ type: 'varchar', length: 16 })
  subjectType!: AttendanceSubjectType;

  /**
   * The person, as a string because the two kinds of subject live in different
   * tables with independent id spaces. Never a foreign key: a withdrawn pupil's
   * folio may be discarded and a leaver's employment row deleted, and neither
   * should silently erase the year they were present for.
   */
  @Column({ type: 'varchar', length: 64 })
  subjectRef!: string;

  /**
   * The person's name as it stood the day they were marked.
   *
   * Denormalised deliberately. A month grid rendered by joining these rows back
   * to the LIVE roster loses everyone who has since left — a pupil withdrawn in
   * week three disappears from the three weeks they attended, and the register
   * the school hands the Education Bureau is short by exactly the children whose
   * attendance was in question. The row has to be able to describe itself.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  subjectName!: string | null;

  /**
   * The class that marked them, LOWERCASED — every SCHOOL reader keys on the
   * lowercased code. Null for staff.
   *
   * Denormalised on purpose, and it is a record of history rather than a copy of
   * the pupil's current class: promotion moves the child, not the register they
   * were taken in, exactly as a tuition line stays tagged with the class that
   * raised it. A RENAME is the one thing that rewrites it, because a rename says
   * the class is now called something else.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  classCode!: string | null;

  @Column({ type: 'varchar', length: 16 })
  status!: AttendanceStatus;

  /** Minutes late, when the school counts them. Null even on a LATE row. */
  @Column({ type: 'int', nullable: true })
  minutesLate!: number | null;

  /** Why — "sick", "at the clinic", "funeral". Free text; schools' reasons are. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  note!: string | null;

  @Column({ type: 'int', nullable: true })
  recordedByUserId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
