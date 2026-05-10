import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Stores per-branch security timestamps used for stateless JWT revocation.
 *
 * How revocation works:
 *   - operatorSessionsRevokedAt is set to NOW() when a manager calls DELETE /operator-sessions.
 *   - On every pos_operator / pos_manager_approval token validation, PosBranchAccessGuard
 *     loads this record and rejects any token whose iat (issued-at) is before the timestamp.
 *   - Because JWT iat is in seconds and we store a full timestamp, we compare:
 *       token.iat * 1000 < operatorSessionsRevokedAt.getTime()
 *   - This invalidates ALL tokens that were issued before the revocation — no blocklist needed.
 *
 * The row is upserted (INSERT ... ON CONFLICT DO UPDATE) so it requires no prior setup.
 */
@Entity('pos_branch_security')
export class PosBranchSecurity {
  @PrimaryColumn({ type: 'int' })
  branchId!: number;

  /**
   * When set, any pos_operator token with iat before this timestamp is rejected.
   * NULL means no branch-wide revocation has ever been issued.
   */
  @Column({ type: 'timestamptz', nullable: true, default: null })
  operatorSessionsRevokedAt!: Date | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
