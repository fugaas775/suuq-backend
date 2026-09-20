import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', nullable: true })
  createdByUserId!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
