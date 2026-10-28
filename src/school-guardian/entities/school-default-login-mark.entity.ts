import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export type SchoolDefaultLoginKind = 'PARENT' | 'STUDENT';

/**
 * "This pupil has been given its default login" — one row per record and
 * kind, written the first time the pupil holds that login, whoever made it.
 *
 * The automatic sweep (SchoolDefaultLoginsService) creates a login only for a
 * record WITHOUT a mark, so a login the office removes or a child it unticks
 * from a family is never handed back by the next sweep. `folioId` is the
 * pupil's record, `pos_suspended_carts.id`; no foreign key, as for the links.
 */
@Entity('pos_school_default_login_marks')
@Unique('uq_pos_school_default_login_marks', ['branchId', 'folioId', 'kind'])
export class SchoolDefaultLoginMark {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @Column({ type: 'int' })
  folioId!: number;

  @Column({ type: 'varchar', length: 16 })
  kind!: SchoolDefaultLoginKind;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
