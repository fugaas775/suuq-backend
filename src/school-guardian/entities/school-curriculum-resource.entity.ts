import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** What a curriculum resource is — decides the icon and the words the readers see. */
export const CURRICULUM_RESOURCE_KINDS = [
  'TEXTBOOK_PDF',
  'POWERPOINT',
  'ITEM_BANK',
] as const;
export type CurriculumResourceKind = (typeof CURRICULUM_RESOURCE_KINDS)[number];

/**
 * A curriculum resource every school on the SCHOOL format gets — a textbook
 * PDF, a set of slides, a bank of practice questions (today, a Google Form
 * quiz per unit for Grade 7 and 8 Mathematics, and two mock regional exams).
 *
 * Platform content, not a school's: there is NO branchId. The platform's
 * admins list them once; every pupil, parent and teacher at every school
 * reads the same list, cut to THEIR grade. `grades` names the audience, not
 * the book — a Grade 7 unit is listed for 7 AND 8 because the Grade 8
 * regional exam draws on both years' work.
 *
 * Two links: `studentUrl` is the one pupils and families open (a quiz's
 * respondent link, a PDF); `teacherUrl` is the teachers' own (a quiz's edit
 * link, with the answers) and never leaves the server on a pupil's or a
 * family's read.
 */
@Entity('pos_school_curriculum_resources')
@Index('idx_pos_school_curriculum_resources_active', ['isActive'])
export class SchoolCurriculumResource {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'varchar', length: 32 })
  kind!: CurriculumResourceKind;

  @Column({ type: 'varchar', length: 120 })
  subject!: string;

  /** The shelf the item sits on — "Grade 7 Mathematics", "Mock regional exams". */
  @Column({ type: 'varchar', length: 120, nullable: true })
  series!: string | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /** The grades whose pupils, families and teachers see it. */
  @Column({ type: 'int', array: true })
  grades!: number[];

  @Column({ type: 'text' })
  studentUrl!: string;

  /** Teachers only. */
  @Column({ type: 'text', nullable: true })
  teacherUrl!: string | null;

  /** For an item bank: how many questions it holds. */
  @Column({ type: 'int', nullable: true })
  questions!: number | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', nullable: true })
  createdByUserId!: number | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  createdByName!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
