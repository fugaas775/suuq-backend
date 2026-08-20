import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SchoolClassStatus {
  ACTIVE = 'ACTIVE',
  // No longer taught (a grade the school has stopped running). Excluded from
  // enrolment but kept, because pupils' folios and their fee history still point
  // at the code. Deliberately no MAINTENANCE member — HOTEL and PROPERTY need one
  // because a room can be out of service; a class is a group of children.
  INACTIVE = 'INACTIVE',
}

/**
 * A class in the branch's own registry — the grade-based analogue of
 * {@link HotelRoom} and {@link PropertyUnit}.
 *
 * SCHOOL was the only board format without one. Its classes lived as a
 * comma-separated string in `product.attributes.hotelRooms`, the quick-setup
 * field HOTEL uses for rooms, and that produced four faults no amount of UI
 * could fix:
 *
 *   - ANY product could declare a class, so two of them claimed the same code
 *     at different prices and the register's last-wins lookup decided the fee by
 *     catalog order (observed live: "Examination Fee" 300 and "Late Fee Payment
 *     Penalty" 200 both claiming `3a, 3b`).
 *   - A class could not exist before someone had priced it, so a school could
 *     not lay out its structure until it had settled its fees.
 *   - One price per product meant one product per fee, so eleven differently
 *     priced grades needed eleven products to model one fee schedule.
 *   - A rename was a substring edit, silently orphaning every folio pointing at
 *     the old code — a class list with no identity cannot be renamed safely.
 *
 * The fee stays on a PRODUCT and is referenced from here by `feeProductId`.
 * That is not a compromise: `PosCheckoutService` re-prices every line from the
 * product it names (`product.salePrice ?? product.price ?? item.unitPrice`), so
 * a fee held anywhere else would show one figure on the board and charge another
 * on the receipt. A class is a group of pupils; a fee item is a thing you sell;
 * this column is the join, and it is nullable so the registry can be laid out
 * first and priced second.
 */
@Entity('pos_school_classes')
@Index('idx_pos_school_classes_branch_status', ['branchId', 'status'])
@Index('uq_pos_school_classes_branch_code', ['branchId', 'code'], {
  unique: true,
})
@Index('idx_pos_school_classes_branch_grade', ['branchId', 'gradeCode'])
export class SchoolClass {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** Unique per branch, as the school writes it: '3A', 'KG II', '1aad'. */
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  /** Display name when the code alone is not one, e.g. 'Grade 3 — Section A'. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  /**
   * The grade this row is a SECTION of — '3aad' for '3aad A' and '3aad B'.
   *
   * A section is a class row, not a second dimension on the pupil. That is the
   * whole design: a pupil's folio carries ONE class string, and every reader
   * keys on it — the attendance register, the mark sheet, rank in class, the
   * tuition line's tag, the roster importer's dedupe. All of those are per
   * TEACHING GROUP, which is precisely what a section is; a school that splits
   * 47 children into 3aad A and 3aad B wants two registers and two mark sheets,
   * not one of each filtered two ways. Making the section a class row hands
   * them all of it and changes nothing about how a pupil is tagged.
   *
   * What the grade IS for is the roll-up a section cannot answer alone: the fee
   * is a grade's, not a section's, and the office reads "Grade 3" on the board
   * and in its reports. So the grade is a grouping KEY, not a row of its own —
   * a grade row would be a class with no pupils in it, showing up empty on the
   * board, in the enrol picker and in the delete guard.
   *
   * Null on both this and {@link section} is a class that is not sectioned,
   * which is every row that existed before this column and every school that
   * never splits a grade. Nothing about them changes.
   *
   * Compared case-insensitively per branch, like `code`, and stored in the
   * spelling the first section of the grade used.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  gradeCode!: string | null;

  /**
   * The section label within the grade — 'A', 'B', 'Blue'.
   *
   * Meaningless without {@link gradeCode} and refused without it: a section
   * that names no grade cannot be grouped, so it would render as a stray letter
   * on the board. Unique per grade per branch, case-insensitively.
   */
  @Column({ type: 'varchar', length: 32, nullable: true })
  section!: string | null;

  /**
   * Teaching order, because a school's classes are not alphabetical.
   * Sorting by code put '10th' before '1aad' before '2aad', which is the order
   * of no school anywhere.
   */
  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  /** The product whose price IS this class's fee. Null = declared, not yet priced. */
  @Column({ type: 'int', nullable: true })
  feeProductId!: number | null;

  /** Places available, for a roll that must not be over-filled. */
  @Column({ type: 'int', nullable: true })
  capacity!: number | null;

  @Column({ type: 'varchar', length: 16, default: SchoolClassStatus.ACTIVE })
  status!: SchoolClassStatus;

  /** Room, class teacher, stream — anything the school wants to keep beside it. */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
