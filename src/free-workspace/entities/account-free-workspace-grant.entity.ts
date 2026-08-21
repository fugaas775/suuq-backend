import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/** What the account spent its one free workspace on. */
export enum FreeWorkspaceGrantKind {
  BRANCH = 'BRANCH',
  SUPPLIER = 'SUPPLIER',
}

/**
 * The record that an account has used its one free workspace.
 *
 * The platform gives every account a single workspace free until the promotion
 * ends — one POS branch OR one supplier account, whichever they open first.
 * Everything after that is paid.
 *
 * It is a row of its own rather than a query over subscriptions because the
 * subscription is the wrong place to keep it: `tenant_subscriptions` cascades
 * away with its tenant, so an owner could delete the free branch and be handed
 * a fresh free one, indefinitely. This row hangs off the USER and outlives
 * whatever it was spent on — the `branchId` / `supplierProfileId` columns
 * deliberately carry no foreign key for that reason. They say what the slot
 * WAS spent on, which stays true after the thing is gone.
 *
 * `releasedAt` is the support escape hatch. The unique index is partial
 * (`WHERE "releasedAt" IS NULL`), so releasing a grant returns the account's
 * slot without losing the history of the first one.
 */
@Entity('account_free_workspace_grants')
@Index('IDX_free_workspace_grants_user', ['userId'])
export class AccountFreeWorkspaceGrant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({
    type: 'varchar',
    length: 16,
  })
  kind!: FreeWorkspaceGrantKind;

  /** Set when kind = BRANCH. No FK: the record must outlive the branch. */
  @Column({ type: 'int', nullable: true })
  branchId?: number | null;

  /** Set when kind = BRANCH. No FK: the record must outlive the tenant. */
  @Column({ type: 'int', nullable: true })
  retailTenantId?: number | null;

  /** Set when kind = SUPPLIER. No FK: the record must outlive the profile. */
  @Column({ type: 'int', nullable: true })
  supplierProfileId?: number | null;

  /** Plan code written onto the subscription row this grant paid for. */
  @Column({ type: 'varchar', length: 64 })
  planCode!: string;

  /** When the free period this grant opened runs out. */
  @Column({ type: 'timestamptz', nullable: true })
  endsAt?: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  grantedAt!: Date;

  /**
   * Set by an operator handing the account its slot back — a workspace created
   * by mistake, a support goodwill call. While null, the account has no slot.
   */
  @Column({ type: 'timestamptz', nullable: true })
  releasedAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  releasedReason?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
