import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * One child a parent's login may read. `folioId` is the pupil's record —
 * `pos_suspended_carts.id`, the same key attendance and the textbook register
 * file under. No foreign key: a withdrawn child's row is discarded, and the
 * family's link to it should say "withdrawn", not vanish.
 */
@Entity('pos_school_guardian_pupils')
@Unique('uq_pos_school_guardian_pupils_guardian_folio', ['guardianId', 'folioId'])
@Index('idx_pos_school_guardian_pupils_folio', ['folioId'])
export class SchoolGuardianPupil {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'bigint' })
  guardianId!: number;

  @Column({ type: 'int' })
  folioId!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
