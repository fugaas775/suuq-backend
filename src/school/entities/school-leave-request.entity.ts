import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/**
 * One request for leave: a member of staff, a kind of leave, a first and a
 * last day, and what the school decided about it.
 *
 * The person is a `pos_branch_employees` row — the employment register, not
 * the login — because leave is an employment fact: a cleaner with no login
 * has leave too, recorded for them by the office. `employeeName` is
 * denormalised like every other register's name: the request must still
 * say whose it was after that person leaves. No foreign keys, by the same
 * rule.
 *
 * `schoolDays` is counted at the time of the request from the timetable's
 * bell (the days any period runs; Monday to Friday when there is no
 * timetable), and frozen: a bell changed in March does not restate a
 * February leave.
 */
@Entity('pos_school_leave_requests')
@Index('idx_pos_school_leave_branch_start', ['branchId', 'startDate'])
@Index('idx_pos_school_leave_branch_employee', ['branchId', 'employeeId'])
@Index('idx_pos_school_leave_branch_status', ['branchId', 'status'])
export class SchoolLeaveRequest {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** `pos_branch_employees.id` — whose leave it is. */
  @Column({ type: 'int' })
  employeeId!: number;

  @Column({ type: 'varchar', length: 160, nullable: true })
  employeeName!: string | null;

  /** The login that filed it — the person's own, or the office's. */
  @Column({ type: 'int', nullable: true })
  requestedByUserId!: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  requestedByName!: string | null;

  /** ANNUAL | SICK | PERSONAL | MATERNITY | PATERNITY | STUDY | BEREAVEMENT | UNPAID | OTHER */
  @Column({ type: 'varchar', length: 24 })
  leaveType!: string;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  /** School days inside the range, as counted when the request was made. */
  @Column({ type: 'int', default: 0 })
  schoolDays!: number;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  reason!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  status!: LeaveStatus;

  @Column({ type: 'int', nullable: true })
  decidedByUserId!: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  decidedByName!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  /** The head's word to the person — why refused, or a condition. */
  @Column({ type: 'varchar', length: 400, nullable: true })
  decisionNote!: string | null;

  /** Who takes the lessons meanwhile — the head's note to the office. */
  @Column({ type: 'varchar', length: 400, nullable: true })
  coverNote!: string | null;

  @Column({ type: 'int', nullable: true })
  cancelledByUserId!: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  cancelledByName!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  cancelNote!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
