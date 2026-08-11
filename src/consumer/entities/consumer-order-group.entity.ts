import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One checkout on suuq-s.com, which may span several shops.
 *
 * A register cart belongs to exactly one branch, so a basket holding items from
 * three shops becomes three `pos_suspended_carts` rows — three separate orders
 * that three separate counters accept, prepare and settle on their own. That is
 * correct for the merchants and useless for the shopper, who did one checkout
 * and wants one thing to follow.
 *
 * This is that one thing. It owns no fulfilment state of its own: each child
 * carries the cart it created, and status is always read back from those carts.
 * Storing a copy here would be a second truth that goes stale the moment staff
 * settle an order on a till that was briefly offline.
 */
@Entity('consumer_order_groups')
export class ConsumerOrderGroup {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  /**
   * The code the shopper holds — `suuq-s.com/o/<publicRef>`.
   *
   * Unguessable on purpose, in the same spirit as `consumerOrderRef`: it is the
   * only credential on an order placed without an account, so it has to be a
   * capability rather than a sequence anyone can walk.
   */
  @Index({ unique: true })
  @Column({ name: 'public_ref', type: 'varchar', length: 24 })
  publicRef!: string;

  @Column({
    name: 'consumer_name',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  consumerName?: string | null;

  @Column({
    name: 'consumer_phone',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  consumerPhone?: string | null;

  /**
   * Set when the shopper happened to be signed in to a Suuq account. Optional by
   * design — requiring one would put a login between a shopper and a shop — but
   * captured when available so the order survives a lost device.
   */
  @Index()
  @Column({ name: 'customer_user_id', type: 'int', nullable: true })
  customerUserId?: number | null;

  /**
   * What the shopper asked for overall: TAKEAWAY, DELIVERY, or MIXED when the
   * sellers in one basket do not agree. Derived from the children at placement,
   * never accepted from the client, so it cannot contradict them.
   */
  @Column({ name: 'fulfillment_mode', type: 'varchar', length: 24 })
  fulfillmentMode!: string;

  /** `{ line1, city, note, latitude, longitude }` — null for collection. */
  @Column({ name: 'delivery_address', type: 'jsonb', nullable: true })
  deliveryAddress?: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: {
      to: (value: number | null | undefined) => value ?? 0,
      from: (value: string | number | null | undefined) =>
        value == null
          ? 0
          : typeof value === 'string'
            ? parseFloat(value)
            : value,
    },
  })
  total!: number;

  @OneToMany(() => ConsumerOrderGroupItem, (item) => item.group)
  items!: ConsumerOrderGroupItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/**
 * One shop's share of a multi-shop checkout.
 *
 * A thin pointer at the `pos_suspended_carts` row that the existing consumer
 * order path created. Everything the merchant does — accept, prepare, settle,
 * reject — happens on that cart through machinery that predates this table and
 * needs no knowledge of it.
 */
@Entity('consumer_order_group_items')
@Index(['groupId', 'branchId'], { unique: true })
export class ConsumerOrderGroupItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'group_id', type: 'bigint' })
  groupId!: string;

  @ManyToOne(() => ConsumerOrderGroup, (group) => group.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'group_id' })
  group!: ConsumerOrderGroup;

  @Column({ name: 'branch_id', type: 'int' })
  branchId!: number;

  /** The `pos_suspended_carts` row this became. The order, as far as POS is concerned. */
  @Column({ name: 'suspended_cart_id', type: 'bigint' })
  suspendedCartId!: string;

  /** `C-<cartId>-<suffix>`, as handed back by the single-order path. */
  @Column({ name: 'order_ref', type: 'varchar', length: 32 })
  orderRef!: string;

  @Column('decimal', {
    precision: 12,
    scale: 2,
    transformer: {
      to: (value: number | null | undefined) => value ?? 0,
      from: (value: string | number | null | undefined) =>
        value == null
          ? 0
          : typeof value === 'string'
            ? parseFloat(value)
            : value,
    },
  })
  subtotal!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
