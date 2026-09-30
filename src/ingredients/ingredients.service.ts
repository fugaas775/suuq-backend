import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  PosCheckout,
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from '../pos-sync/entities/pos-checkout.entity';
import { Product } from '../products/entities/product.entity';
import {
  CreateIngredientDto,
  IngredientMovementsQueryDto,
  ListIngredientsQueryDto,
  RecordIngredientMovementDto,
  ReplaceRecipeDto,
  UpdateIngredientDto,
} from './dto/ingredients.dto';
import { Ingredient } from './entities/ingredient.entity';
import {
  IngredientMovement,
  IngredientMovementSource,
  IngredientMovementType,
} from './entities/ingredient-movement.entity';
import { ProductRecipe } from './entities/product-recipe.entity';
import {
  INGREDIENT_UNITS,
  branchTracksIngredients,
  normalizeUnit,
  roundMoney,
  roundQty,
} from './ingredient-units';

export interface IngredientsActor {
  userId: number | null;
  name: string | null;
  /** Owner, admin, or branch manager. The only people who change the shelf. */
  isManagerLike: boolean;
}

export type IngredientState = 'OK' | 'LOW' | 'NEGATIVE';

export interface IngredientView {
  id: number;
  branchId: number;
  name: string;
  unit: string;
  onHand: number;
  avgUnitCost: number;
  /** What the shelf is worth at the average: max(onHand, 0) × avgUnitCost. */
  stockValue: number;
  lowStockThreshold: number | null;
  isActive: boolean;
  note: string | null;
  state: IngredientState;
  updatedAt: string | null;
}

export interface RecordIngredientMovementInput {
  branchId: number;
  ingredientId: number;
  movementType: IngredientMovementType;
  /** OPENING / PURCHASE (> 0), CONSUMPTION / ADJUSTMENT (signed). */
  quantityDelta?: number;
  /** COUNT: what was on the shelf. */
  countedOnHand?: number;
  /** OPENING / PURCHASE. */
  unitCost?: number;
  /** OPENING / PURCHASE alternative: what the lot cost in total. */
  costTotal?: number;
  sourceType: string;
  sourceReferenceId?: number | null;
  sourceLineRef?: string | null;
  productId?: number | null;
  /** VOID: the movement being undone. */
  reversesMovementId?: number | null;
  reason?: string | null;
  note?: string | null;
  actorUserId?: number | null;
  occurredAt?: Date | null;
}

export interface RecordIngredientMovementResult {
  movement: IngredientMovement;
  ingredient: Ingredient;
  /** The movement already existed; nothing was written. */
  duplicate: boolean;
}

/** Postgres unique-violation, however the driver wrapped it. */
function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return String(code) === '23505';
}

/**
 * The idempotency ref of one checkout line. `lineId` is optional on the
 * persisted items, so an index fallback keeps a legacy row keyable; the
 * items array is JSON and its order is stable, which is what makes that
 * safe.
 */
export function checkoutLineRef(
  item: { lineId?: string | null } | null | undefined,
  index: number,
): string {
  const explicit = String(item?.lineId ?? '').trim();
  return (explicit || `i${index}`).slice(0, 120);
}

function stateOf(ingredient: {
  onHand: number;
  lowStockThreshold?: number | null;
}): IngredientState {
  const onHand = Number(ingredient.onHand) || 0;
  if (onHand < 0) return 'NEGATIVE';
  const threshold = ingredient.lowStockThreshold;
  if (threshold != null && onHand <= Number(threshold)) return 'LOW';
  return 'OK';
}

/**
 * The kitchen's shelf.
 *
 * Three rules carry the weight:
 *
 *   1. A movement is the only way on-hand changes, and every movement owns a
 *      transaction that locks the ingredient row first. Two sales of the same
 *      tea in the same second serialise on that lock; the weighted average
 *      they read is the one the other one wrote.
 *
 *   2. A movement with a source reference is written at most once. The
 *      (ingredient, source, document, line) key is checked under the lock and
 *      backstopped by a partial unique index, so a checkout that is synced
 *      twice, or a run approval that is retried, finds its row and leaves it.
 *
 *   3. On-hand may go NEGATIVE, and no sale is ever refused for it. The
 *      product ledger clamps at zero and records an oversell; the shelf does
 *      the opposite, because a negative kilo of sugar is the ledger saying
 *      "you used more than you recorded buying" — which is the most useful
 *      thing it can say, and which a clamp would hide. The UI shows it red
 *      and asks for a count.
 */
@Injectable()
export class IngredientsService {
  private readonly logger = new Logger(IngredientsService.name);

  constructor(
    @InjectRepository(Ingredient)
    private readonly ingredients: Repository<Ingredient>,
    @InjectRepository(IngredientMovement)
    private readonly movements: Repository<IngredientMovement>,
    @InjectRepository(ProductRecipe)
    private readonly recipes: Repository<ProductRecipe>,
    @InjectRepository(Branch)
    private readonly branches: Repository<Branch>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ------------------------------------------------------------------ shaping

  toView(row: Ingredient): IngredientView {
    const onHand = Number(row.onHand) || 0;
    const avg = Number(row.avgUnitCost) || 0;
    return {
      id: Number(row.id),
      branchId: Number(row.branchId),
      name: row.name,
      unit: row.unit,
      onHand: roundQty(onHand),
      avgUnitCost: roundQty(avg),
      stockValue: roundMoney(Math.max(onHand, 0) * avg),
      lowStockThreshold:
        row.lowStockThreshold == null ? null : Number(row.lowStockThreshold),
      isActive: row.isActive !== false,
      note: row.note ?? null,
      state: stateOf(row),
      updatedAt: row.updatedAt?.toISOString?.() ?? null,
    };
  }

  toMovementView(row: IngredientMovement) {
    return {
      id: Number(row.id),
      ingredientId: Number(row.ingredientId),
      movementType: row.movementType,
      quantityDelta: Number(row.quantityDelta) || 0,
      unitCost: Number(row.unitCost) || 0,
      costDelta: Number(row.costDelta) || 0,
      onHandAfter: Number(row.onHandAfter) || 0,
      avgUnitCostAfter: Number(row.avgUnitCostAfter) || 0,
      sourceType: row.sourceType,
      sourceReferenceId: row.sourceReferenceId ?? null,
      sourceLineRef: row.sourceLineRef ?? null,
      productId: row.productId ?? null,
      reversesMovementId: row.reversesMovementId ?? null,
      reversedByMovementId: row.reversedByMovementId ?? null,
      reason: row.reason ?? null,
      actorUserId: row.actorUserId ?? null,
      note: row.note ?? null,
      occurredAt: row.occurredAt?.toISOString?.() ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? null,
    };
  }

  // ------------------------------------------------------------------- guards

  private assertMayWrite(actor: IngredientsActor) {
    if (actor?.isManagerLike) return;
    throw new ForbiddenException(
      "Only this branch's owner or a manager can change ingredients and recipes.",
    );
  }

  private async loadBranch(branchId: number): Promise<Branch | null> {
    return this.branches.findOne({
      where: { id: branchId },
      select: ['id', 'serviceFormat'],
    });
  }

  private async assertTracks(branchId: number): Promise<void> {
    const branch = await this.loadBranch(branchId);
    if (!branch) throw new NotFoundException('That branch was not found.');
    if (!branchTracksIngredients(branch)) {
      throw new BadRequestException(
        'Ingredient tracking is only available for quick-service restaurants.',
      );
    }
  }

  private async loadIngredientOrFail(
    id: number,
    branchId: number,
  ): Promise<Ingredient> {
    const row = await this.ingredients.findOne({ where: { id, branchId } });
    if (!row) throw new NotFoundException('That ingredient was not found.');
    return row;
  }

  private parseDate(value: string | undefined | null, field: string): Date {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} could not be read as a date.`);
    }
    return date;
  }

  /**
   * Every id names an ACTIVE ingredient on this branch, or the caller is told
   * which one does not. Used by purchasing before it saves a linked line and
   * by the recipe editor before it writes.
   */
  async assertBranchIngredients(
    branchId: number,
    ids: number[],
  ): Promise<void> {
    const wanted = Array.from(
      new Set(
        (ids || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );
    if (!wanted.length) return;
    const found = await this.ingredients.find({
      where: { branchId, id: In(wanted), isActive: true },
      select: ['id'],
    });
    const have = new Set(found.map((row) => Number(row.id)));
    const missing = wanted.filter((id) => !have.has(id));
    if (missing.length) {
      throw new BadRequestException(
        `Ingredient #${missing[0]} is not on this branch's shelf.`,
      );
    }
  }

  // -------------------------------------------------------------------- reads

  async list(query: ListIngredientsQueryDto, _actor?: IngredientsActor) {
    const branch = await this.loadBranch(query.branchId);
    if (!branch || !branchTracksIngredients(branch)) {
      // Not an error: the purchases drawer asks on every format and reads
      // this as "nothing to offer".
      return { tracksIngredients: false, units: [...INGREDIENT_UNITS], items: [] };
    }
    const rows = await this.ingredients.find({
      where: query.includeInactive
        ? { branchId: query.branchId }
        : { branchId: query.branchId, isActive: true },
      order: { name: 'ASC' },
    });
    const needle = String(query.search || '')
      .trim()
      .toLowerCase();
    const items = rows
      .filter((row) => !needle || row.name.toLowerCase().includes(needle))
      .map((row) => this.toView(row));
    return { tracksIngredients: true, units: [...INGREDIENT_UNITS], items };
  }

  /** Negative first, then low. Empty on any other format. */
  async lowStock(branchId: number) {
    const listed = await this.list({ branchId });
    const rank: Record<IngredientState, number> = { NEGATIVE: 0, LOW: 1, OK: 2 };
    const items = listed.items
      .filter((item) => item.state !== 'OK')
      .sort(
        (a, b) => rank[a.state] - rank[b.state] || a.name.localeCompare(b.name),
      );
    return { tracksIngredients: listed.tracksIngredients, items };
  }

  async listMovements(id: number, query: IngredientMovementsQueryDto) {
    const ingredient = await this.loadIngredientOrFail(id, query.branchId);
    const qb = this.movements
      .createQueryBuilder('m')
      .where('m."ingredientId" = :id', { id: ingredient.id })
      .andWhere('m."branchId" = :branchId', { branchId: query.branchId })
      .orderBy('m."occurredAt"', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .take(Math.min(Math.max(Number(query.limit) || 50, 1), 200));
    if (query.from) {
      qb.andWhere('m."occurredAt" >= :from', {
        from: this.parseDate(query.from, 'from'),
      });
    }
    if (query.to) {
      qb.andWhere('m."occurredAt" <= :to', {
        to: this.parseDate(query.to, 'to'),
      });
    }
    const rows = await qb.getMany();
    return {
      ingredient: this.toView(ingredient),
      items: rows.map((row) => this.toMovementView(row)),
    };
  }

  // ------------------------------------------------------------------- writes

  async create(dto: CreateIngredientDto, actor: IngredientsActor) {
    this.assertMayWrite(actor);
    await this.assertTracks(dto.branchId);
    const unit = normalizeUnit(dto.unit);
    if (!unit) throw new BadRequestException('Pick a unit for the ingredient.');
    const name = String(dto.name || '').trim();
    if (!name) throw new BadRequestException('Give the ingredient a name.');

    // A name that was retired comes back rather than colliding with itself:
    // "Sugar" switched off in June and typed again in September is the same
    // sugar, and its history should be too.
    const existing = await this.ingredients
      .createQueryBuilder('i')
      .where('i."branchId" = :branchId', { branchId: dto.branchId })
      .andWhere('LOWER(i.name) = LOWER(:name)', { name })
      .getOne();
    let row: Ingredient;
    if (existing && existing.isActive) {
      throw new ConflictException(
        `You already have an ingredient called "${existing.name}".`,
      );
    } else if (existing) {
      const moved = await this.movements.count({
        where: { ingredientId: existing.id },
      });
      existing.isActive = true;
      existing.name = name;
      if (!moved) existing.unit = unit;
      if (dto.lowStockThreshold !== undefined) {
        existing.lowStockThreshold = dto.lowStockThreshold ?? null;
      }
      if (dto.note !== undefined) existing.note = dto.note ?? null;
      row = await this.ingredients.save(existing);
    } else {
      try {
        row = await this.ingredients.save(
          this.ingredients.create({
            branchId: dto.branchId,
            name,
            unit,
            onHand: 0,
            avgUnitCost: 0,
            lowStockThreshold: dto.lowStockThreshold ?? null,
            isActive: true,
            note: dto.note ?? null,
            createdByUserId: actor.userId ?? null,
          }),
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `You already have an ingredient called "${name}".`,
          );
        }
        throw error;
      }
    }

    const opening = Number(dto.openingQuantity) || 0;
    if (opening > 0) {
      const result = await this.recordMovement({
        branchId: dto.branchId,
        ingredientId: row.id,
        movementType: IngredientMovementType.OPENING,
        quantityDelta: opening,
        unitCost: dto.openingUnitCost,
        costTotal:
          dto.openingTotalCost != null && dto.openingUnitCost == null
            ? Number(dto.openingTotalCost)
            : undefined,
        sourceType: IngredientMovementSource.MANUAL,
        actorUserId: actor.userId ?? null,
        occurredAt: new Date(),
        note: 'Opening stock',
      });
      row = result.ingredient;
    }
    return this.toView(row);
  }

  async update(id: number, dto: UpdateIngredientDto, actor: IngredientsActor) {
    this.assertMayWrite(actor);
    const row = await this.loadIngredientOrFail(id, dto.branchId);

    if (dto.name !== undefined) {
      const name = String(dto.name || '').trim();
      if (!name) throw new BadRequestException('Give the ingredient a name.');
      row.name = name;
    }
    if (dto.unit !== undefined && dto.unit !== null) {
      const unit = normalizeUnit(dto.unit);
      if (!unit) throw new BadRequestException('That unit is not recognised.');
      if (unit !== row.unit) {
        const moved = await this.movements.count({
          where: { ingredientId: row.id },
        });
        if (moved) {
          throw new ConflictException(
            'The unit cannot change once stock has moved — every recipe and every movement is written in it. Retire this ingredient and create another.',
          );
        }
        row.unit = unit;
      }
    }
    if (dto.lowStockThreshold !== undefined) {
      row.lowStockThreshold = dto.lowStockThreshold ?? null;
    }
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    if (dto.note !== undefined) row.note = dto.note ?? null;

    try {
      const saved = await this.ingredients.save(row);
      return this.toView(saved);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `You already have an ingredient called "${row.name}".`,
        );
      }
      throw error;
    }
  }

  /** A receipt, a correction or a count typed by hand in the hub. */
  async record(
    id: number,
    dto: RecordIngredientMovementDto,
    actor: IngredientsActor,
  ) {
    this.assertMayWrite(actor);
    const row = await this.loadIngredientOrFail(id, dto.branchId);
    const quantity = Number(dto.quantity);
    if (!Number.isFinite(quantity)) {
      throw new BadRequestException('The quantity could not be read.');
    }
    const occurredAt = this.parseDate(dto.occurredAt, 'occurredAt');
    const base = {
      branchId: dto.branchId,
      ingredientId: row.id,
      sourceType: IngredientMovementSource.MANUAL,
      reason: dto.reason ? String(dto.reason).slice(0, 32) : null,
      note: dto.note ?? null,
      actorUserId: actor.userId ?? null,
      occurredAt,
    };
    let result: RecordIngredientMovementResult;
    switch (dto.movementType) {
      case 'PURCHASE': {
        if (!(quantity > 0)) {
          throw new BadRequestException(
            'A receipt must add a positive quantity.',
          );
        }
        result = await this.recordMovement({
          ...base,
          movementType: IngredientMovementType.PURCHASE,
          quantityDelta: quantity,
          unitCost: dto.unitCost,
          costTotal:
            dto.totalCost != null && dto.unitCost == null
              ? Number(dto.totalCost)
              : undefined,
        });
        break;
      }
      case 'ADJUSTMENT': {
        if (quantity === 0) {
          throw new BadRequestException(
            'Nothing to record: the change is zero.',
          );
        }
        result = await this.recordMovement({
          ...base,
          movementType: IngredientMovementType.ADJUSTMENT,
          quantityDelta: quantity,
        });
        break;
      }
      case 'COUNT': {
        if (quantity < 0) {
          throw new BadRequestException('A count cannot be negative.');
        }
        result = await this.recordMovement({
          ...base,
          movementType: IngredientMovementType.COUNT,
          countedOnHand: quantity,
        });
        break;
      }
      default:
        throw new BadRequestException('That movement type is not allowed here.');
    }
    return {
      movement: this.toMovementView(result.movement),
      ingredient: this.toView(result.ingredient),
      duplicate: result.duplicate,
    };
  }

  // ------------------------------------------------------------------- ledger

  /**
   * Write one movement in its own transaction. See the class comment for the
   * lock and the idempotency rule; the unique index catches the race the
   * pre-check under the lock cannot (two writers on DIFFERENT ingredients
   * never contend, so the check is authoritative — but the index costs
   * nothing and a second, later caller with a different locking discipline
   * is still safe).
   */
  async recordMovement(
    input: RecordIngredientMovementInput,
  ): Promise<RecordIngredientMovementResult> {
    try {
      return await this.dataSource.transaction((manager) =>
        this.recordMovementWithManager(manager, input),
      );
    } catch (error) {
      if (
        isUniqueViolation(error) &&
        input.sourceReferenceId != null &&
        input.sourceLineRef
      ) {
        const existing = await this.findBySource(this.movements, input);
        const ingredient = await this.ingredients.findOne({
          where: { id: input.ingredientId },
        });
        if (existing && ingredient) {
          return { movement: existing, ingredient, duplicate: true };
        }
      }
      throw error;
    }
  }

  private findBySource(
    repo: Repository<IngredientMovement>,
    input: Pick<
      RecordIngredientMovementInput,
      'ingredientId' | 'sourceType' | 'sourceReferenceId' | 'sourceLineRef'
    >,
  ) {
    return repo.findOne({
      where: {
        ingredientId: input.ingredientId,
        sourceType: input.sourceType,
        sourceReferenceId: Number(input.sourceReferenceId),
        sourceLineRef: String(input.sourceLineRef),
      },
    });
  }

  async recordMovementWithManager(
    manager: EntityManager,
    input: RecordIngredientMovementInput,
  ): Promise<RecordIngredientMovementResult> {
    const ingredientRepo = manager.getRepository(Ingredient);
    const movementRepo = manager.getRepository(IngredientMovement);

    const ingredient = await ingredientRepo
      .createQueryBuilder('i')
      .setLock('pessimistic_write')
      .where('i.id = :id', { id: input.ingredientId })
      .andWhere('i."branchId" = :branchId', { branchId: input.branchId })
      .getOne();
    if (!ingredient) {
      throw new NotFoundException('That ingredient was not found.');
    }

    if (input.sourceReferenceId != null && input.sourceLineRef) {
      const existing = await this.findBySource(movementRepo, input);
      if (existing) return { movement: existing, ingredient, duplicate: true };
    }

    const prev = Number(ingredient.onHand) || 0;
    const avg = Number(ingredient.avgUnitCost) || 0;
    let delta = 0;
    let unitCost = avg;
    let costDelta = 0;
    let newAvg = avg;
    let reversesId: number | null = null;

    switch (input.movementType) {
      case IngredientMovementType.OPENING:
      case IngredientMovementType.PURCHASE: {
        delta = roundQty(input.quantityDelta ?? 0);
        if (!(delta > 0)) {
          throw new BadRequestException(
            'A receipt must add a positive quantity.',
          );
        }
        if (input.unitCost != null && Number.isFinite(Number(input.unitCost))) {
          unitCost = Math.max(0, Number(input.unitCost));
          costDelta = roundMoney(delta * unitCost);
        } else if (
          input.costTotal != null &&
          Number.isFinite(Number(input.costTotal))
        ) {
          const total = Math.max(0, Number(input.costTotal));
          // A free lot (or a line with no price yet) must not drag the average
          // to zero: it is stock at the price we already know, costing nothing
          // more. Its money view is exactly what it cost — nothing.
          unitCost = total > 0 ? total / delta : avg;
          costDelta = roundMoney(total);
        } else {
          unitCost = avg;
          costDelta = roundMoney(delta * avg);
        }
        const base = Math.max(prev, 0);
        newAvg =
          base + delta > 0
            ? (base * avg + delta * unitCost) / (base + delta)
            : unitCost;
        break;
      }
      case IngredientMovementType.CONSUMPTION:
      case IngredientMovementType.ADJUSTMENT: {
        delta = roundQty(input.quantityDelta ?? 0);
        if (delta === 0) {
          throw new BadRequestException('Nothing to record: the change is zero.');
        }
        unitCost = avg;
        costDelta = roundMoney(delta * avg);
        break;
      }
      case IngredientMovementType.COUNT: {
        const counted = roundQty(input.countedOnHand ?? 0);
        delta = roundQty(counted - prev);
        unitCost = avg;
        costDelta = roundMoney(delta * avg);
        break;
      }
      case IngredientMovementType.VOID: {
        const originalId = Number(input.reversesMovementId);
        const original = await movementRepo.findOne({
          where: { id: originalId, ingredientId: ingredient.id },
        });
        if (!original) {
          throw new NotFoundException('That movement was not found.');
        }
        if (original.movementType === IngredientMovementType.VOID) {
          throw new ConflictException('A reversal cannot itself be reversed.');
        }
        if (original.reversedByMovementId != null) {
          const reversal = await movementRepo.findOne({
            where: { id: Number(original.reversedByMovementId) },
          });
          return {
            movement: reversal ?? original,
            ingredient,
            duplicate: true,
          };
        }
        const originalQty = Number(original.quantityDelta) || 0;
        delta = roundQty(-originalQty);
        unitCost = Number(original.unitCost) || 0;
        costDelta = roundMoney(-(Number(original.costDelta) || 0));
        const after = prev + delta;
        if (
          (original.movementType === IngredientMovementType.PURCHASE ||
            original.movementType === IngredientMovementType.OPENING) &&
          after > 0
        ) {
          // Take the receipt back out of the average the way it went in.
          newAvg = Math.max(0, (prev * avg - originalQty * unitCost) / after);
        }
        reversesId = Number(original.id);
        break;
      }
      default:
        throw new BadRequestException('That movement type is not recognised.');
    }

    const newOnHand = roundQty(prev + delta);
    newAvg = roundQty(Number.isFinite(newAvg) ? newAvg : avg);

    const movement = await movementRepo.save(
      movementRepo.create({
        branchId: input.branchId,
        ingredientId: ingredient.id,
        movementType: input.movementType,
        quantityDelta: delta,
        unitCost: roundQty(unitCost),
        costDelta,
        onHandAfter: newOnHand,
        avgUnitCostAfter: newAvg,
        sourceType: input.sourceType,
        sourceReferenceId: input.sourceReferenceId ?? null,
        sourceLineRef: input.sourceLineRef
          ? String(input.sourceLineRef).slice(0, 160)
          : null,
        productId: input.productId ?? null,
        reversesMovementId: reversesId,
        reversedByMovementId: null,
        reason: input.reason ? String(input.reason).slice(0, 32) : null,
        actorUserId: input.actorUserId ?? null,
        note: input.note ?? null,
        occurredAt: input.occurredAt ?? new Date(),
      }),
    );
    if (reversesId != null) {
      await movementRepo.update(
        { id: reversesId },
        { reversedByMovementId: Number(movement.id) },
      );
    }
    await ingredientRepo.update(
      { id: ingredient.id },
      { onHand: newOnHand, avgUnitCost: newAvg },
    );
    ingredient.onHand = newOnHand;
    ingredient.avgUnitCost = newAvg;
    return { movement, ingredient, duplicate: false };
  }

  // ------------------------------------------------------------ the sale hook

  /**
   * Draw the recipes of a settled sale down off the shelf.
   *
   * Called AFTER the checkout's own transaction has committed, and never
   * throws into it: the sale is real money and the shelf is bookkeeping about
   * it. A failure here is logged by the caller and the movements table simply
   * lacks a row — which the next sync of the same checkout writes, because the
   * key is deterministic.
   *
   * A RETURN puts the plates back (sign +1), matching the sign the P&L gives
   * its revenue. Not because the kitchen gets its flour back — it does not —
   * but because cost of goods must follow revenue, and a return that removed
   * the revenue and kept the cost would report a loss on a sale that never
   * happened.
   */
  async consumeForCheckout(
    checkout: PosCheckout,
    branch?: Branch | null,
  ): Promise<{ consumed: number; duplicates: number }> {
    const none = { consumed: 0, duplicates: 0 };
    if (!checkout || checkout.status !== PosCheckoutStatus.PROCESSED) {
      return none;
    }
    const resolvedBranch =
      branch ?? (await this.loadBranch(Number(checkout.branchId)));
    if (!branchTracksIngredients(resolvedBranch)) return none;

    const items = Array.isArray(checkout.items) ? checkout.items : [];
    const productIds = Array.from(
      new Set(
        items
          .map((item) => Number(item?.productId))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );
    if (!productIds.length) return none;

    const recipeRows = await this.recipes.find({
      where: { branchId: checkout.branchId, productId: In(productIds) },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    if (!recipeRows.length) return none;
    const byProduct = new Map<number, ProductRecipe[]>();
    for (const row of recipeRows) {
      const key = Number(row.productId);
      if (!byProduct.has(key)) byProduct.set(key, []);
      byProduct.get(key)!.push(row);
    }

    const sign =
      checkout.transactionType === PosCheckoutTransactionType.RETURN ? 1 : -1;
    const label = checkout.receiptNumber
      ? `Sale ${checkout.receiptNumber}`
      : `Sale #${checkout.id}`;
    const plan: RecordIngredientMovementInput[] = [];
    items.forEach((item, index) => {
      const lines = byProduct.get(Number(item?.productId));
      if (!lines?.length) return;
      const quantity = Math.abs(Number(item.quantity) || 0);
      if (!quantity) return;
      const lineRef = checkoutLineRef(item, index);
      for (const line of lines) {
        const delta = roundQty(sign * quantity * (Number(line.quantity) || 0));
        if (!delta) continue;
        plan.push({
          branchId: Number(checkout.branchId),
          ingredientId: Number(line.ingredientId),
          movementType: IngredientMovementType.CONSUMPTION,
          quantityDelta: delta,
          sourceType: IngredientMovementSource.POS_CHECKOUT,
          sourceReferenceId: Number(checkout.id),
          sourceLineRef: lineRef,
          productId: Number(item.productId),
          occurredAt: checkout.occurredAt ?? new Date(),
          note: `${label} — ${String(item.title || '').trim() || `product #${item.productId}`}`,
        });
      }
    });
    if (!plan.length) return none;
    // One order for every writer, so two sales sharing sugar and flour lock
    // them in the same sequence and cannot deadlock.
    plan.sort(
      (a, b) =>
        a.ingredientId - b.ingredientId ||
        String(a.sourceLineRef).localeCompare(String(b.sourceLineRef)),
    );

    return this.applyPlan(plan);
  }

  /**
   * Undo what a sale drew down, because the sale was voided.
   *
   * Reverses whatever was recorded — a sale's draw-down or a return's
   * put-back — so it is not SALE-only the way the product restore is.
   */
  async reverseForCheckout(
    checkout: PosCheckout,
    actorUserId: number | null,
    voidedAt: Date,
  ): Promise<{ reversed: number; duplicates: number }> {
    const rows = await this.movements.find({
      where: {
        branchId: Number(checkout.branchId),
        sourceType: IngredientMovementSource.POS_CHECKOUT,
        sourceReferenceId: Number(checkout.id),
        reversedByMovementId: IsNull(),
      },
      order: { ingredientId: 'ASC', id: 'ASC' },
    });
    if (!rows.length) return { reversed: 0, duplicates: 0 };
    const label = checkout.receiptNumber
      ? `sale ${checkout.receiptNumber}`
      : `sale #${checkout.id}`;
    const plan: RecordIngredientMovementInput[] = rows.map((row) => ({
      branchId: Number(row.branchId),
      ingredientId: Number(row.ingredientId),
      movementType: IngredientMovementType.VOID,
      reversesMovementId: Number(row.id),
      sourceType: IngredientMovementSource.POS_CHECKOUT_VOID,
      sourceReferenceId: Number(checkout.id),
      sourceLineRef: row.sourceLineRef ?? `m${row.id}`,
      productId: row.productId ?? null,
      actorUserId: actorUserId ?? null,
      occurredAt: voidedAt ?? new Date(),
      note: `Void of ${label}`,
    }));
    const result = await this.applyPlan(plan);
    return { reversed: result.consumed, duplicates: result.duplicates };
  }

  /**
   * All of a plan in one transaction; on the one failure the transaction
   * cannot express — a concurrent identical writer got there first, which
   * aborts the whole batch on the unique index — fall back to one
   * transaction per line, where each duplicate is answered individually.
   */
  private async applyPlan(
    plan: RecordIngredientMovementInput[],
  ): Promise<{ consumed: number; duplicates: number }> {
    let consumed = 0;
    let duplicates = 0;
    try {
      await this.dataSource.transaction(async (manager) => {
        for (const input of plan) {
          const result = await this.recordMovementWithManager(manager, input);
          if (result.duplicate) duplicates += 1;
          else consumed += 1;
        }
      });
      return { consumed, duplicates };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    consumed = 0;
    duplicates = 0;
    for (const input of plan) {
      try {
        const result = await this.recordMovement(input);
        if (result.duplicate) duplicates += 1;
        else consumed += 1;
      } catch (error) {
        if (error instanceof NotFoundException) continue;
        throw error;
      }
    }
    return { consumed, duplicates };
  }

  // ------------------------------------------------------ the purchasing hook

  /** A signed-off run line that named an ingredient: stock in, at its price. */
  async receiveForPurchaseRunLine(
    run: { id: number; branchId: number; occurredAt?: Date | null },
    line: {
      id: number;
      ingredientId?: number | null;
      stockQuantity?: number | null;
      lineTotal?: number | null;
      description?: string | null;
    },
    actor: { userId: number | null },
  ): Promise<RecordIngredientMovementResult> {
    return this.recordMovement({
      branchId: Number(run.branchId),
      ingredientId: Number(line.ingredientId),
      movementType: IngredientMovementType.PURCHASE,
      quantityDelta: Number(line.stockQuantity) || 0,
      costTotal: Math.max(0, Number(line.lineTotal) || 0),
      sourceType: IngredientMovementSource.PURCHASE_RUN,
      sourceReferenceId: Number(run.id),
      sourceLineRef: `line:${line.id}`,
      actorUserId: actor?.userId ?? null,
      occurredAt: run.occurredAt ?? new Date(),
      note: `Purchase run #${run.id} — ${String(line.description || '').trim()}`,
    });
  }

  /** The line was struck, or the run voided: take that receipt back out. */
  async reverseForPurchaseRunLine(
    run: { id: number; branchId: number },
    line: {
      id: number;
      ingredientId?: number | null;
      ingredientMovementId?: number | null;
      description?: string | null;
    },
    actor: { userId: number | null },
    reason?: string | null,
  ): Promise<RecordIngredientMovementResult> {
    return this.recordMovement({
      branchId: Number(run.branchId),
      ingredientId: Number(line.ingredientId),
      movementType: IngredientMovementType.VOID,
      reversesMovementId: Number(line.ingredientMovementId),
      sourceType: IngredientMovementSource.PURCHASE_RUN_VOID,
      sourceReferenceId: Number(run.id),
      sourceLineRef: `line:${line.id}`,
      actorUserId: actor?.userId ?? null,
      occurredAt: new Date(),
      note: `Voided line on run #${run.id} — ${String(line.description || '').trim()}${
        reason ? ` (${reason})` : ''
      }`,
    });
  }

  // ------------------------------------------------------------------ recipes

  async getRecipes(branchId: number, productId?: number) {
    const branch = await this.loadBranch(branchId);
    const tracks = branchTracksIngredients(branch);
    if (!tracks) return { tracksIngredients: false, items: [] };
    const rows = await this.recipes.find({
      where: productId ? { branchId, productId } : { branchId },
      order: { productId: 'ASC', sortOrder: 'ASC', id: 'ASC' },
    });
    const ingredientRows = rows.length
      ? await this.ingredients.find({ where: { branchId } })
      : [];
    const costById = new Map<number, number>();
    for (const row of ingredientRows) {
      costById.set(Number(row.id), Number(row.avgUnitCost) || 0);
    }
    const grouped = new Map<
      number,
      { productId: number; lines: any[]; plateCost: number }
    >();
    for (const row of rows) {
      const key = Number(row.productId);
      if (!grouped.has(key)) {
        grouped.set(key, { productId: key, lines: [], plateCost: 0 });
      }
      const entry = grouped.get(key)!;
      const quantity = Number(row.quantity) || 0;
      entry.lines.push({
        ingredientId: Number(row.ingredientId),
        quantity: roundQty(quantity),
        sortOrder: row.sortOrder ?? 0,
      });
      entry.plateCost = roundMoney(
        entry.plateCost + quantity * (costById.get(Number(row.ingredientId)) ?? 0),
      );
    }
    return { tracksIngredients: true, items: Array.from(grouped.values()) };
  }

  /**
   * Replace a product's recipe as a set, in one transaction — a recipe is one
   * document. An empty list clears it.
   */
  async replaceRecipe(
    branchId: number,
    productId: number,
    dto: ReplaceRecipeDto,
    actor: IngredientsActor,
  ) {
    this.assertMayWrite(actor);
    await this.assertTracks(branchId);
    const product = await this.products.findOne({
      where: { id: productId },
      select: ['id'],
    });
    if (!product) throw new NotFoundException('That menu item was not found.');

    const lines = (dto.lines || []).map((line, index) => ({
      ingredientId: Number(line.ingredientId),
      quantity: roundQty(Number(line.quantity)),
      sortOrder: index,
    }));
    const seen = new Set<number>();
    for (const line of lines) {
      if (!(line.quantity > 0)) {
        throw new BadRequestException(
          'Every recipe line needs a quantity above zero.',
        );
      }
      if (seen.has(line.ingredientId)) {
        throw new BadRequestException(
          'An ingredient appears twice on this recipe — combine the two lines.',
        );
      }
      seen.add(line.ingredientId);
    }
    await this.assertBranchIngredients(
      branchId,
      lines.map((line) => line.ingredientId),
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(ProductRecipe, { branchId, productId });
      if (lines.length) {
        await manager.save(
          ProductRecipe,
          lines.map((line) =>
            manager.create(ProductRecipe, {
              branchId,
              productId,
              ingredientId: line.ingredientId,
              quantity: line.quantity,
              sortOrder: line.sortOrder,
            }),
          ),
        );
      }
    });

    const fresh = await this.getRecipes(branchId, productId);
    return fresh.items[0] ?? { productId, lines: [], plateCost: 0 };
  }

  // -------------------------------------------------------------------- usage

  /**
   * What the shelf did over a range: bought, used, corrected — per
   * ingredient, and the used side per menu item too. Reversed pairs are
   * skipped on both sides.
   */
  async usage(branchId: number, fromRaw: string, toRaw: string) {
    const from = this.parseDate(fromRaw, 'from');
    const to = this.parseDate(toRaw, 'to');
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException('The range ends before it starts.');
    }

    const perIngredient = await this.movements
      .createQueryBuilder('m')
      .select('m."ingredientId"', 'ingredientId')
      .addSelect(
        `SUM(CASE WHEN m."movementType" = 'CONSUMPTION' THEN -m."quantityDelta" ELSE 0 END)`,
        'consumedQty',
      )
      .addSelect(
        `SUM(CASE WHEN m."movementType" = 'CONSUMPTION' THEN -m."costDelta" ELSE 0 END)`,
        'consumedCost',
      )
      .addSelect(
        `SUM(CASE WHEN m."movementType" IN ('PURCHASE','OPENING') THEN m."quantityDelta" ELSE 0 END)`,
        'purchasedQty',
      )
      .addSelect(
        `SUM(CASE WHEN m."movementType" IN ('PURCHASE','OPENING') THEN m."costDelta" ELSE 0 END)`,
        'purchasedCost',
      )
      .addSelect(
        `SUM(CASE WHEN m."movementType" IN ('ADJUSTMENT','COUNT') THEN m."quantityDelta" ELSE 0 END)`,
        'adjustedQty',
      )
      .addSelect(
        `SUM(CASE WHEN m."movementType" IN ('ADJUSTMENT','COUNT') THEN m."costDelta" ELSE 0 END)`,
        'adjustedCost',
      )
      .where('m."branchId" = :branchId', { branchId })
      .andWhere('m."reversedByMovementId" IS NULL')
      .andWhere(`m."movementType" <> 'VOID'`)
      .andWhere('m."occurredAt" >= :from', { from })
      .andWhere('m."occurredAt" <= :to', { to })
      .groupBy('m."ingredientId"')
      .getRawMany<Record<string, string | number | null>>();

    const perProduct = await this.movements
      .createQueryBuilder('m')
      .select('m."productId"', 'productId')
      .addSelect('SUM(-m."costDelta")', 'ingredientCost')
      .addSelect('COUNT(DISTINCT m."sourceReferenceId")', 'sales')
      .where('m."branchId" = :branchId', { branchId })
      .andWhere(`m."movementType" = 'CONSUMPTION'`)
      .andWhere('m."reversedByMovementId" IS NULL')
      .andWhere('m."productId" IS NOT NULL')
      .andWhere('m."occurredAt" >= :from', { from })
      .andWhere('m."occurredAt" <= :to', { to })
      .groupBy('m."productId"')
      .getRawMany<Record<string, string | number | null>>();

    const ingredientRows = await this.ingredients.find({
      where: { branchId },
      order: { name: 'ASC' },
    });
    const ingredientById = new Map(
      ingredientRows.map((row) => [Number(row.id), row] as const),
    );
    const productIds = perProduct
      .map((row) => Number(row.productId))
      .filter((id) => Number.isFinite(id) && id > 0);
    const productRows = productIds.length
      ? await this.products.find({
          where: { id: In(productIds) },
          select: ['id', 'name'],
        })
      : [];
    const productName = new Map(
      productRows.map((row) => [Number(row.id), row.name] as const),
    );

    let totalConsumedCost = 0;
    const items = perIngredient
      .map((row) => {
        const ingredient = ingredientById.get(Number(row.ingredientId));
        const consumedCost = roundMoney(Number(row.consumedCost) || 0);
        totalConsumedCost += consumedCost;
        return {
          ingredientId: Number(row.ingredientId),
          name: ingredient?.name ?? `Ingredient #${row.ingredientId}`,
          unit: ingredient?.unit ?? null,
          onHand: ingredient ? roundQty(Number(ingredient.onHand) || 0) : null,
          consumedQty: roundQty(Number(row.consumedQty) || 0),
          consumedCost,
          purchasedQty: roundQty(Number(row.purchasedQty) || 0),
          purchasedCost: roundMoney(Number(row.purchasedCost) || 0),
          adjustedQty: roundQty(Number(row.adjustedQty) || 0),
          adjustedCost: roundMoney(Number(row.adjustedCost) || 0),
        };
      })
      .sort((a, b) => b.consumedCost - a.consumedCost || a.name.localeCompare(b.name));

    const byProduct = perProduct
      .map((row) => ({
        productId: Number(row.productId),
        name: productName.get(Number(row.productId)) ?? `Product #${row.productId}`,
        ingredientCost: roundMoney(Number(row.ingredientCost) || 0),
        sales: Number(row.sales) || 0,
      }))
      .sort((a, b) => b.ingredientCost - a.ingredientCost);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalConsumedCost: roundMoney(totalConsumedCost),
      items,
      byProduct,
    };
  }
}
