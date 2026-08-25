import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Branch } from '../../branches/entities/branch.entity';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value == null ? value : Number(value),
};

export enum PosCashMovementDirection {
  /** Money into the drawer. */
  IN = 'IN',
  /** Money out of the drawer. */
  OUT = 'OUT',
}

export enum PosCashMovementReason {
  /** Cash handed to a purchaser before a market run. */
  PURCHASE_ADVANCE = 'PURCHASE_ADVANCE',
  /** What the purchaser brought back. */
  PURCHASE_CHANGE_RETURN = 'PURCHASE_CHANGE_RETURN',
  /**
   * The purchaser spent more than the advance and was reimbursed out of the
   * drawer. It happens: the price of meat moved between the ask and the market.
   */
  PURCHASE_TOP_UP = 'PURCHASE_TOP_UP',
}

/**
 * Cash that moved through the drawer without a sale behind it.
 *
 * Every till in this system computes what SHOULD be in the drawer as
 * `openingFloat + cash taken`. That formula is correct only for a drawer nobody
 * ever takes money out of, and it has never been true of a restaurant: cash goes
 * out before service to buy the food. Without a record of it the count at close
 * comes up short by exactly the advance, and a short drawer is not read as
 * bookkeeping — it is read as a cashier stealing.
 *
 * Deliberately generic. The three reasons here are all purchasing's, because
 * that is what needed it first, but the shape — a branch, a session, a
 * direction, an amount, and what it was for — is the shape of a cash drop to the
 * safe, a petty-cash payout, an owner's draw. The next one adds a reason, not a
 * table.
 *
 * `sourceType`/`sourceId` are how a movement points back at the document that
 * caused it, so a drawer line reading −2,500 can be opened and turn out to be
 * run #14.
 */
@Entity('pos_cash_movements')
@Index('idx_pos_cash_movements_session', ['registerSessionId'])
@Index('idx_pos_cash_movements_branch_occurred', ['branchId', 'occurredAt'])
@Index('idx_pos_cash_movements_source', ['sourceType', 'sourceId'])
export class PosCashMovement {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch?: Branch;

  /**
   * Nullable, and that is not an oversight. An advance issued before anyone
   * opened the till still left the premises, and a movement we refuse to record
   * because no session was open is a movement that goes back to being invisible.
   * The reconciliation reads only the ones that name a session; the rest still
   * appear in the branch's cash book.
   */
  @Column({ type: 'int', nullable: true })
  registerSessionId?: number | null;

  @Column({ type: 'enum', enum: PosCashMovementDirection })
  direction!: PosCashMovementDirection;

  /** Always positive. The direction column carries the sign. */
  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount!: number;

  @Column({ type: 'varchar', length: 8, default: 'ETB' })
  currency!: string;

  @Column({ type: 'enum', enum: PosCashMovementReason })
  reason!: PosCashMovementReason;

  @Column({ type: 'varchar', length: 32, nullable: true })
  sourceType?: string | null;

  @Column({ type: 'int', nullable: true })
  sourceId?: number | null;

  @Column({ type: 'int', nullable: true })
  recordedByUserId?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  recordedByName?: string | null;

  @Column({ type: 'timestamp' })
  occurredAt!: Date;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
