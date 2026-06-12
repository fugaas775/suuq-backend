import { Column, Entity, PrimaryColumn } from 'typeorm';
import { GlAccountType, GlNormalBalance } from '../gl-accounts.constant';

/**
 * Chart-of-accounts row. Global (codes are universal); per-branch balances live
 * in gl_journal_lines, scoped by branchId. Seeded by the CreateGeneralLedger
 * migration from GL_ACCOUNT_SEED.
 */
@Entity('gl_accounts')
export class GlAccount {
  @PrimaryColumn({ type: 'varchar', length: 8 })
  code!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'enum', enum: GlAccountType, enumName: 'gl_account_type' })
  type!: GlAccountType;

  @Column({
    type: 'enum',
    enum: GlNormalBalance,
    enumName: 'gl_normal_balance',
  })
  normalBalance!: GlNormalBalance;

  @Column({ type: 'boolean', nullable: true })
  isCurrent?: boolean | null;

  @Column({ type: 'boolean', default: false })
  contra!: boolean;
}
