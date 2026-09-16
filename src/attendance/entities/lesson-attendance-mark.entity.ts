import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AttendanceStatus,
  AttendanceSubjectType,
} from './attendance-mark.entity';

/**
 * One person, one day, one LESSON, one mark — the grain below the day.
 *
 * ── Why a second table, when the day register insisted on one ─────────────
 * `pos_branch_attendance` holds pupils and staff together because a pupil's
 * day and a teacher's day are the same document with the same key: (person,
 * day). A lesson mark is a different document. Its key is (person, day,
 * period, class) — SMAQ's Temesgen holds Monday P1 in a morning class AND
 * Monday P1 in an afternoon class, and both are lessons he either taught or
 * did not. Putting that key beside the day key in one table would mean every
 * reader of the day register filtering out a grain it never asked for, and
 * the roll sheet's by-person index silently picking whichever row came last.
 * The day register's readers are untouched by this table existing.
 *
 * ── What defines "the lessons a teacher should be in" ────────────────────
 * The branch's timetable (`pos_school_timetables`), by weekday. Nothing here
 * copies the timetable: a row exists because somebody marked a lesson, and an
 * unmarked lesson is unmarked — never absent, never present — exactly as the
 * day register treats an unmarked day. `classCode` and `subject` are
 * denormalised so a month's export still says which class and subject a mark
 * was for after the timetable has been rewritten for the next term.
 *
 * `subjectType` is carried for symmetry with the day register (a pupil's
 * lesson-by-lesson register is a plausible next step); today only STAFF rows
 * are written, by the staff controller, behind the same POS_MANAGER gate.
 */
@Entity('pos_branch_lesson_attendance')
@Index(
  'uq_pos_branch_lesson_attendance_lesson',
  [
    'branchId',
    'subjectType',
    'subjectRef',
    'attendanceDate',
    'periodCode',
    'classCode',
  ],
  { unique: true },
)
@Index('idx_pos_branch_lesson_attendance_branch_type_date', [
  'branchId',
  'subjectType',
  'attendanceDate',
])
export class LessonAttendanceMark {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** The school day, as the school's own calendar names it. A DATE, no zone. */
  @Column({ type: 'date' })
  attendanceDate!: string;

  @Column({ type: 'varchar', length: 16 })
  subjectType!: AttendanceSubjectType;

  /** `pos_branch_employees.id` for staff. No foreign key — the row outlives the person. */
  @Column({ type: 'varchar', length: 64 })
  subjectRef!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subjectName!: string | null;

  /** The bell period, as the timetable spells it: 'P1'. */
  @Column({ type: 'varchar', length: 16 })
  periodCode!: string;

  /** The class taught, LOWERCASED like every SCHOOL reader keys it. */
  @Column({ type: 'varchar', length: 64 })
  classCode!: string;

  /** What was on the timetable for that lesson — for the export, not the key. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  subject!: string | null;

  @Column({ type: 'varchar', length: 16 })
  status!: AttendanceStatus;

  @Column({ type: 'int', nullable: true })
  minutesLate!: number | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note!: string | null;

  @Column({ type: 'int', nullable: true })
  recordedByUserId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
