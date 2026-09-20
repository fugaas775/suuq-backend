import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** pg hands numeric back as a string; the register reads a number. */
const numericTransformer = {
  to: (v: number | null | undefined) => (v == null ? null : v),
  from: (v: string | null) => (v == null ? null : Number(v)),
};

/**
 * A textbook a class is issued — the school's own list, one row per title
 * per class. The home-room teacher adds them; a title no longer in use is
 * deactivated rather than deleted, because loans still name it.
 */
@Entity('pos_school_textbook_titles')
@Index('idx_pos_school_textbook_titles_branch_class', ['branchId', 'classCode'])
export class SchoolTextbookTitle {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /** LOWERCASED, like every SCHOOL reader keys a class. */
  @Column({ type: 'varchar', length: 64 })
  classCode!: string;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  /**
   * The subject this book is for — the teacher who takes that subject in
   * the class is the one who provides it. Spelled as the timetable spells
   * the subject; matched case-insensitively. Null for a book the home room
   * lists for everyone.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  subject!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /**
   * What a replacement costs the family — the figure the office bills when a
   * book is marked lost. Set by the office; a teacher's register never shows
   * it. Null until the school prices the title.
   */
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  replacementPrice!: number | null;

  @Column({ type: 'int', nullable: true })
  createdByUserId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
