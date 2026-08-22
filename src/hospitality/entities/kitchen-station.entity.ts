import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum KitchenStationStatus {
  ACTIVE = 'ACTIVE',
  /**
   * No longer a place food is made — a grill that was taken out, a juice bar
   * that closed. Kept rather than deleted because a parked order printed before
   * the change still names the code, and a reprint of that order has to be able
   * to say where its items went. Excluded from routing and from the picker.
   */
  INACTIVE = 'INACTIVE',
}

/**
 * A prep area in the branch's own words — "Grill", "Juice bar", "Shaah".
 *
 * The kitchen station already existed in this system as a hard-coded ten-member
 * list (`KITCHEN_STATION_LABELS` in the frontend: GRILL, HOT_LINE, GARDE_MANGER,
 * SAUTE, EXPO…). That vocabulary is a Western restaurant brigade, and it was
 * fine while a station only filtered an on-screen kitchen display for CAFETERIA.
 * It stops being fine the moment the station name is PRINTED ON PAPER a cook
 * reads: a fast-food shop in Jigjiga has a grill and a juice counter, not a
 * garde manger, and no amount of translation makes "Saute station" the name of
 * the thing in their shop.
 *
 * So a station is a row a branch creates, not a member of an enum we ship.
 *
 * **The routing map rides on `metadata.categories`** — the menu categories whose
 * items this station prepares (`['BURGERS', 'PIZZA']`). It lives here rather
 * than in a table of its own because the till reads stations and routing in the
 * same breath (it needs both to split one order's slip), and one fetch that
 * answers both questions is one fewer thing to be stale. A category claimed by
 * two stations resolves to the lower `sortOrder`; the editor warns rather than
 * refusing, because a half-finished re-route is a normal intermediate state.
 *
 * `sortOrder` is load-bearing in a way a school class's is not: it is the order
 * the TICKETS COME OUT OF THE PRINTER. A shop puts the station furthest from the
 * counter first so the runner walks one loop.
 */
@Entity('pos_kitchen_stations')
@Index('idx_pos_kitchen_stations_branch_status', ['branchId', 'status'])
@Index('uq_pos_kitchen_stations_branch_code', ['branchId', 'code'], {
  unique: true,
})
export class KitchenStation {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: number;

  @Column({ type: 'int' })
  branchId!: number;

  /**
   * Stable handle, unique per branch, compared case-insensitively.
   *
   * Derived from the name on creation but never re-derived: renaming "Grill" to
   * "Hot grill" must not orphan the routing that points at it, and it must not
   * change what a reprint of an already-printed order says.
   */
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  /** What prints at the head of the ticket. Falls back to `code` when unset. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  name!: string | null;

  /** The order the tickets print in. Spaced by ten, as the class registry is. */
  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'varchar', length: 16, default: KitchenStationStatus.ACTIVE })
  status!: KitchenStationStatus;

  /** `{ categories: string[] }` — the menu categories routed to this station. */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
