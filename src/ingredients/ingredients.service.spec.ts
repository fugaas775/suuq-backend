import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { FindOperator } from 'typeorm';
import {
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from '../pos-sync/entities/pos-checkout.entity';
import { Ingredient } from './entities/ingredient.entity';
import {
  IngredientMovement,
  IngredientMovementType,
} from './entities/ingredient-movement.entity';
import { ProductRecipe } from './entities/product-recipe.entity';
import { IngredientsService, checkoutLineRef } from './ingredients.service';

/**
 * An in-memory shelf. The service's arithmetic is the thing under test, so
 * the repositories are small stores with a `where` matcher rather than
 * jest.fn() stubs answering with fixtures — a movement that is written must
 * be readable by the next call, or idempotency cannot be tested at all.
 */
function matches(row: any, where: Record<string, any> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected instanceof FindOperator) {
      if (expected.type === 'isNull') return actual == null;
      if (expected.type === 'in') {
        return (expected.value as any[]).map(Number).includes(Number(actual));
      }
      throw new Error(`unsupported operator ${expected.type}`);
    }
    return String(actual) === String(expected);
  });
}

function makeService(over: {
  branch?: { id: number; serviceFormat: string } | null;
  ingredients?: any[];
  movements?: any[];
  recipes?: any[];
  products?: any[];
  /** Simulate a writer racing us: the in-tx pre-check sees nothing, the insert collides. */
  raceOnce?: boolean;
} = {}) {
  const state = {
    ingredients: (over.ingredients ?? []).map((row) => ({ ...row })),
    movements: (over.movements ?? []).map((row) => ({ ...row })),
    recipes: (over.recipes ?? []).map((row) => ({ ...row })),
    products: over.products ?? [{ id: 4211, name: 'Shaah' }],
    nextId: 1000,
    raceOnce: Boolean(over.raceOnce),
    locks: [] as number[],
  };
  const branch = over.branch === undefined ? { id: 44, serviceFormat: 'QSR' } : over.branch;

  const ingredientsRepo: any = {
    find: async ({ where, order }: any = {}) => {
      const rows = state.ingredients.filter((row) => matches(row, where));
      if (order?.name) rows.sort((a, b) => a.name.localeCompare(b.name));
      return rows.map((row) => ({ ...row }));
    },
    findOne: async ({ where }: any) => {
      const row = state.ingredients.find((r) => matches(r, where));
      return row ? { ...row } : null;
    },
    create: (value: any) => ({ ...value }),
    save: async (value: any) => {
      if (value.id) {
        const idx = state.ingredients.findIndex((r) => r.id === value.id);
        state.ingredients[idx] = { ...state.ingredients[idx], ...value };
        return { ...state.ingredients[idx] };
      }
      const clash = state.ingredients.find(
        (r) =>
          r.branchId === value.branchId &&
          r.name.toLowerCase() === String(value.name).toLowerCase(),
      );
      if (clash) throw Object.assign(new Error('dup'), { code: '23505' });
      const row = { ...value, id: state.nextId++, updatedAt: new Date() };
      state.ingredients.push(row);
      return { ...row };
    },
    createQueryBuilder: () => {
      const qb: any = {
        _branchId: null as number | null,
        _name: '',
        where: (_sql: string, params: any) => {
          qb._branchId = params.branchId;
          return qb;
        },
        andWhere: (_sql: string, params: any) => {
          qb._name = String(params.name).toLowerCase();
          return qb;
        },
        getOne: async () => {
          const row = state.ingredients.find(
            (r) =>
              r.branchId === qb._branchId && r.name.toLowerCase() === qb._name,
          );
          return row ? { ...row } : null;
        },
      };
      return qb;
    },
  };

  const movementsRepo: any = {
    find: async ({ where, order }: any = {}) => {
      const rows = state.movements.filter((row) => matches(row, where));
      if (order?.ingredientId) {
        rows.sort((a, b) => a.ingredientId - b.ingredientId || a.id - b.id);
      }
      return rows.map((row) => ({ ...row }));
    },
    findOne: async ({ where }: any) => {
      const row = state.movements.find((r) => matches(r, where));
      return row ? { ...row } : null;
    },
    count: async ({ where }: any) =>
      state.movements.filter((row) => matches(row, where)).length,
  };

  const recipesRepo: any = {
    find: async ({ where }: any = {}) =>
      state.recipes.filter((row) => matches(row, where)).map((r) => ({ ...r })),
  };
  const branchesRepo: any = {
    findOne: async () => (branch ? { ...branch } : null),
  };
  const productsRepo: any = {
    findOne: async ({ where }: any) =>
      state.products.find((row) => matches(row, where)) ?? null,
    find: async ({ where }: any) =>
      state.products.filter((row) => matches(row, where)),
  };

  const txIngredients: any = {
    createQueryBuilder: () => {
      const qb: any = {
        _id: null as number | null,
        _branchId: null as number | null,
        setLock: () => qb,
        where: (_sql: string, params: any) => {
          qb._id = Number(params.id);
          return qb;
        },
        andWhere: (_sql: string, params: any) => {
          qb._branchId = Number(params.branchId);
          return qb;
        },
        getOne: async () => {
          state.locks.push(qb._id);
          const row = state.ingredients.find(
            (r) => r.id === qb._id && r.branchId === qb._branchId,
          );
          return row ? { ...row } : null;
        },
      };
      return qb;
    },
    update: async ({ id }: any, patch: any) => {
      const idx = state.ingredients.findIndex((r) => r.id === id);
      state.ingredients[idx] = { ...state.ingredients[idx], ...patch };
    },
  };
  const txMovements: any = {
    findOne: async ({ where }: any) => {
      if (state.raceOnce && where?.sourceLineRef) {
        // The pre-check under the lock sees an empty table; the insert
        // below then collides with the row the other writer committed.
        return null;
      }
      const row = state.movements.find((r) => matches(r, where));
      return row ? { ...row } : null;
    },
    create: (value: any) => ({ ...value }),
    save: async (value: any) => {
      if (state.raceOnce) {
        state.raceOnce = false;
        throw Object.assign(new Error('dup'), { code: '23505' });
      }
      const row = { ...value, id: state.nextId++, createdAt: new Date() };
      state.movements.push(row);
      return { ...row };
    },
    update: async ({ id }: any, patch: any) => {
      const idx = state.movements.findIndex((r) => r.id === id);
      state.movements[idx] = { ...state.movements[idx], ...patch };
    },
  };
  const manager: any = {
    getRepository: (entity: unknown) => {
      if (entity === Ingredient) return txIngredients;
      if (entity === IngredientMovement) return txMovements;
      throw new Error('unexpected repository');
    },
    delete: async (_entity: unknown, where: any) => {
      state.recipes = state.recipes.filter((row) => !matches(row, where));
    },
    create: (_entity: unknown, value: any) => ({ ...value }),
    save: async (_entity: unknown, rows: any[]) => {
      for (const row of rows) state.recipes.push({ ...row, id: state.nextId++ });
      return rows;
    },
  };
  const dataSource: any = {
    transaction: async (cb: any) => cb(manager),
  };

  const service = new IngredientsService(
    ingredientsRepo,
    movementsRepo,
    recipesRepo,
    branchesRepo,
    productsRepo,
    dataSource,
  );
  return { service, state };
}

const manager = { userId: 5, name: 'Hodan', isManagerLike: true };
const waiter = { userId: 12, name: 'Maxamed', isManagerLike: false };

function sugar(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    branchId: 44,
    name: 'Sugar',
    unit: 'KG',
    onHand: 0,
    avgUnitCost: 0,
    lowStockThreshold: 5,
    isActive: true,
    note: null,
    updatedAt: new Date('2026-09-30T06:00:00Z'),
    ...over,
  };
}

describe('IngredientsService — the ledger', () => {
  it('blends a receipt into the weighted average', async () => {
    const { service, state } = makeService({ ingredients: [sugar()] });
    await service.recordMovement({
      branchId: 44,
      ingredientId: 7,
      movementType: IngredientMovementType.OPENING,
      quantityDelta: 25,
      unitCost: 100,
      sourceType: 'MANUAL',
    });
    const result = await service.recordMovement({
      branchId: 44,
      ingredientId: 7,
      movementType: IngredientMovementType.PURCHASE,
      quantityDelta: 10,
      costTotal: 1300,
      sourceType: 'MANUAL',
    });
    expect(result.duplicate).toBe(false);
    expect(result.ingredient.onHand).toBe(35);
    expect(result.ingredient.avgUnitCost).toBe(108.5714);
    expect(result.movement.unitCost).toBe(130);
    expect(result.movement.costDelta).toBe(1300);
    expect(result.movement.onHandAfter).toBe(35);
    expect(state.ingredients[0].avgUnitCost).toBe(108.5714);
  });

  it('a receipt onto a negative shelf resets the average to its own price', async () => {
    const { service } = makeService({
      ingredients: [sugar({ onHand: -2, avgUnitCost: 100 })],
    });
    const result = await service.recordMovement({
      branchId: 44,
      ingredientId: 7,
      movementType: IngredientMovementType.PURCHASE,
      quantityDelta: 10,
      unitCost: 130,
      sourceType: 'MANUAL',
    });
    expect(result.ingredient.onHand).toBe(8);
    expect(result.ingredient.avgUnitCost).toBe(130);
  });

  it('a free lot neither dilutes the average nor costs anything', async () => {
    const { service } = makeService({
      ingredients: [sugar({ onHand: 10, avgUnitCost: 100 })],
    });
    const result = await service.recordMovement({
      branchId: 44,
      ingredientId: 7,
      movementType: IngredientMovementType.PURCHASE,
      quantityDelta: 5,
      costTotal: 0,
      sourceType: 'MANUAL',
    });
    expect(result.ingredient.avgUnitCost).toBe(100);
    expect(result.movement.costDelta).toBe(0);
  });

  it('consumption snapshots the average and is allowed below zero', async () => {
    const { service } = makeService({
      ingredients: [sugar({ onHand: 1, avgUnitCost: 100 })],
    });
    const result = await service.recordMovement({
      branchId: 44,
      ingredientId: 7,
      movementType: IngredientMovementType.CONSUMPTION,
      quantityDelta: -3,
      sourceType: 'POS_CHECKOUT',
      sourceReferenceId: 501,
      sourceLineRef: 'line-1',
    });
    expect(result.ingredient.onHand).toBe(-2);
    expect(result.movement.unitCost).toBe(100);
    expect(result.movement.costDelta).toBe(-300);
    expect(result.ingredient.avgUnitCost).toBe(100);
  });

  it('a count records the variance', async () => {
    const { service } = makeService({
      ingredients: [sugar({ onHand: 25, avgUnitCost: 100 })],
    });
    const result = await service.recordMovement({
      branchId: 44,
      ingredientId: 7,
      movementType: IngredientMovementType.COUNT,
      countedOnHand: 24.5,
      sourceType: 'MANUAL',
    });
    expect(result.movement.quantityDelta).toBe(-0.5);
    expect(result.movement.costDelta).toBe(-50);
    expect(result.ingredient.onHand).toBe(24.5);
  });

  it('writes a sourced movement once — the second call finds the first', async () => {
    const { service, state } = makeService({
      ingredients: [sugar({ onHand: 10, avgUnitCost: 100 })],
    });
    const input = {
      branchId: 44,
      ingredientId: 7,
      movementType: IngredientMovementType.CONSUMPTION,
      quantityDelta: -1,
      sourceType: 'POS_CHECKOUT',
      sourceReferenceId: 501,
      sourceLineRef: 'line-1',
    };
    const first = await service.recordMovement(input);
    const second = await service.recordMovement(input);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.movement.id).toBe(first.movement.id);
    expect(state.movements).toHaveLength(1);
    expect(state.ingredients[0].onHand).toBe(9);
  });

  it('a race on the unique index re-reads the winner instead of throwing', async () => {
    const { service, state } = makeService({
      ingredients: [sugar({ onHand: 10, avgUnitCost: 100 })],
      movements: [
        {
          id: 1,
          branchId: 44,
          ingredientId: 7,
          movementType: 'CONSUMPTION',
          quantityDelta: -1,
          sourceType: 'POS_CHECKOUT',
          sourceReferenceId: 501,
          sourceLineRef: 'line-1',
        },
      ],
      raceOnce: true,
    });
    const result = await service.recordMovement({
      branchId: 44,
      ingredientId: 7,
      movementType: IngredientMovementType.CONSUMPTION,
      quantityDelta: -1,
      sourceType: 'POS_CHECKOUT',
      sourceReferenceId: 501,
      sourceLineRef: 'line-1',
    });
    expect(result.duplicate).toBe(true);
    expect(result.movement.id).toBe(1);
    expect(state.movements).toHaveLength(1);
  });

  it('a VOID of a receipt takes it back out of the average and stamps the original', async () => {
    const { service, state } = makeService({ ingredients: [sugar()] });
    await service.recordMovement({
      branchId: 44,
      ingredientId: 7,
      movementType: IngredientMovementType.OPENING,
      quantityDelta: 25,
      unitCost: 100,
      sourceType: 'MANUAL',
    });
    const purchase = await service.recordMovement({
      branchId: 44,
      ingredientId: 7,
      movementType: IngredientMovementType.PURCHASE,
      quantityDelta: 10,
      unitCost: 130,
      sourceType: 'PURCHASE_RUN',
      sourceReferenceId: 14,
      sourceLineRef: 'line:3',
    });
    expect(purchase.ingredient.avgUnitCost).toBe(108.5714);

    const reversal = await service.recordMovement({
      branchId: 44,
      ingredientId: 7,
      movementType: IngredientMovementType.VOID,
      reversesMovementId: purchase.movement.id,
      sourceType: 'PURCHASE_RUN_VOID',
      sourceReferenceId: 14,
      sourceLineRef: 'line:3',
    });
    expect(reversal.duplicate).toBe(false);
    expect(reversal.movement.quantityDelta).toBe(-10);
    expect(reversal.movement.unitCost).toBe(130);
    expect(reversal.movement.costDelta).toBe(-1300);
    expect(reversal.ingredient.onHand).toBe(25);
    expect(reversal.ingredient.avgUnitCost).toBe(100);
    const original = state.movements.find((m) => m.id === purchase.movement.id);
    expect(original.reversedByMovementId).toBe(reversal.movement.id);

    const again = await service.recordMovement({
      branchId: 44,
      ingredientId: 7,
      movementType: IngredientMovementType.VOID,
      reversesMovementId: purchase.movement.id,
      sourceType: 'PURCHASE_RUN_VOID',
      sourceReferenceId: 14,
      sourceLineRef: 'line:3',
    });
    expect(again.duplicate).toBe(true);
    expect(state.ingredients[0].onHand).toBe(25);
  });

  it('a VOID cannot itself be reversed', async () => {
    const { service } = makeService({
      ingredients: [sugar({ onHand: 5, avgUnitCost: 100 })],
      movements: [
        {
          id: 1,
          branchId: 44,
          ingredientId: 7,
          movementType: 'VOID',
          quantityDelta: 1,
          unitCost: 100,
          costDelta: 100,
          sourceType: 'POS_CHECKOUT_VOID',
        },
      ],
    });
    await expect(
      service.recordMovement({
        branchId: 44,
        ingredientId: 7,
        movementType: IngredientMovementType.VOID,
        reversesMovementId: 1,
        sourceType: 'MANUAL',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('IngredientsService — the sale hook', () => {
  const checkout = (over: any = {}) => ({
    id: 501,
    branchId: 44,
    receiptNumber: 'R-77',
    status: PosCheckoutStatus.PROCESSED,
    transactionType: PosCheckoutTransactionType.SALE,
    occurredAt: new Date('2026-09-30T08:30:00Z'),
    items: [
      { lineId: 'line-1', productId: 4211, title: 'Shaah', quantity: 2 },
      { lineId: 'line-2', productId: 9999, title: 'Water', quantity: 1 },
    ],
    ...over,
  });
  const recipe = { id: 1, branchId: 44, productId: 4211, ingredientId: 7, quantity: 0.05, sortOrder: 0 };

  it('draws each recipe line down, keyed on the checkout line', async () => {
    const { service, state } = makeService({
      ingredients: [sugar({ onHand: 25, avgUnitCost: 100 })],
      recipes: [recipe],
    });
    const result = await service.consumeForCheckout(checkout() as any);
    expect(result).toEqual({ consumed: 1, duplicates: 0 });
    expect(state.movements).toHaveLength(1);
    const row = state.movements[0];
    expect(row.movementType).toBe('CONSUMPTION');
    expect(row.quantityDelta).toBe(-0.1);
    expect(row.costDelta).toBe(-10);
    expect(row.productId).toBe(4211);
    expect(row.sourceType).toBe('POS_CHECKOUT');
    expect(row.sourceReferenceId).toBe(501);
    expect(row.sourceLineRef).toBe('line-1');
    expect(row.occurredAt.toISOString()).toBe('2026-09-30T08:30:00.000Z');
    expect(state.ingredients[0].onHand).toBe(24.9);

    const again = await service.consumeForCheckout(checkout() as any);
    expect(again).toEqual({ consumed: 0, duplicates: 1 });
    expect(state.ingredients[0].onHand).toBe(24.9);
  });

  it('does nothing on a format that does not track ingredients', async () => {
    const { service, state } = makeService({
      branch: { id: 44, serviceFormat: 'CAFETERIA' },
      ingredients: [sugar({ onHand: 25, avgUnitCost: 100 })],
      recipes: [recipe],
    });
    expect(await service.consumeForCheckout(checkout() as any)).toEqual({
      consumed: 0,
      duplicates: 0,
    });
    expect(state.movements).toHaveLength(0);
  });

  it('does nothing for a checkout that is not PROCESSED', async () => {
    const { service, state } = makeService({
      ingredients: [sugar({ onHand: 25, avgUnitCost: 100 })],
      recipes: [recipe],
    });
    await service.consumeForCheckout(
      checkout({ status: PosCheckoutStatus.FAILED }) as any,
    );
    expect(state.movements).toHaveLength(0);
  });

  it('a RETURN puts the plates back', async () => {
    const { service, state } = makeService({
      ingredients: [sugar({ onHand: 25, avgUnitCost: 100 })],
      recipes: [recipe],
    });
    await service.consumeForCheckout(
      checkout({
        transactionType: PosCheckoutTransactionType.RETURN,
        items: [{ lineId: 'r-1', productId: 4211, quantity: -1 }],
      }) as any,
    );
    expect(state.movements[0].quantityDelta).toBe(0.05);
    expect(state.movements[0].costDelta).toBe(5);
    expect(state.ingredients[0].onHand).toBe(25.05);
  });

  it('keys a legacy line without a lineId on its index', () => {
    expect(checkoutLineRef({ lineId: null }, 0)).toBe('i0');
    expect(checkoutLineRef({ lineId: ' L9 ' }, 3)).toBe('L9');
    expect(checkoutLineRef(undefined, 2)).toBe('i2');
  });

  it('locks ingredients in one order however the basket was typed', async () => {
    const { service, state } = makeService({
      ingredients: [
        sugar({ id: 9, name: 'Flour', onHand: 10, avgUnitCost: 40 }),
        sugar({ id: 7, onHand: 25, avgUnitCost: 100 }),
      ],
      recipes: [
        { id: 1, branchId: 44, productId: 4211, ingredientId: 9, quantity: 0.2, sortOrder: 0 },
        { id: 2, branchId: 44, productId: 4211, ingredientId: 7, quantity: 0.05, sortOrder: 1 },
      ],
    });
    await service.consumeForCheckout(checkout() as any);
    expect(state.locks).toEqual([7, 9]);
  });

  it('reverses a voided sale exactly once', async () => {
    const { service, state } = makeService({
      ingredients: [sugar({ onHand: 25, avgUnitCost: 100 })],
      recipes: [recipe],
    });
    await service.consumeForCheckout(checkout() as any);
    const first = await service.reverseForCheckout(
      checkout() as any,
      5,
      new Date('2026-09-30T09:00:00Z'),
    );
    expect(first).toEqual({ reversed: 1, duplicates: 0 });
    expect(state.ingredients[0].onHand).toBe(25);
    const voidRow = state.movements.find((m) => m.movementType === 'VOID');
    expect(voidRow.sourceType).toBe('POS_CHECKOUT_VOID');
    expect(voidRow.quantityDelta).toBe(0.1);
    expect(voidRow.costDelta).toBe(10);
    expect(state.movements[0].reversedByMovementId).toBe(voidRow.id);

    const second = await service.reverseForCheckout(
      checkout() as any,
      5,
      new Date(),
    );
    expect(second).toEqual({ reversed: 0, duplicates: 0 });
    expect(state.ingredients[0].onHand).toBe(25);
  });
});

describe('IngredientsService — purchasing', () => {
  it("a run line's receipt stores the line's exact total", async () => {
    const { service } = makeService({
      ingredients: [sugar({ onHand: 25, avgUnitCost: 100 })],
    });
    const result = await service.receiveForPurchaseRunLine(
      { id: 14, branchId: 44, occurredAt: new Date('2026-09-29T06:00:00Z') },
      { id: 3, ingredientId: 7, stockQuantity: 10, lineTotal: 1200, description: 'Sugar' },
      { userId: 12 },
    );
    expect(result.movement.sourceType).toBe('PURCHASE_RUN');
    expect(result.movement.sourceReferenceId).toBe(14);
    expect(result.movement.sourceLineRef).toBe('line:3');
    expect(result.movement.costDelta).toBe(1200);
    expect(result.movement.unitCost).toBe(120);
    expect(result.ingredient.avgUnitCost).toBe(105.7143);
    expect(result.movement.occurredAt.toISOString()).toBe('2026-09-29T06:00:00.000Z');
  });

  it('refuses an ingredient from another branch on a run line', async () => {
    const { service } = makeService({ ingredients: [sugar()] });
    await expect(service.assertBranchIngredients(44, [7, 8])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.assertBranchIngredients(44, [7])).resolves.toBeUndefined();
  });
});

describe('IngredientsService — the shelf', () => {
  it('lists nothing, without complaint, on a format that does not track ingredients', async () => {
    const { service } = makeService({
      branch: { id: 44, serviceFormat: 'RETAIL' },
      ingredients: [sugar()],
    });
    expect(await service.list({ branchId: 44 })).toEqual({
      tracksIngredients: false,
      units: ['KG', 'G', 'L', 'ML', 'PCS'],
      items: [],
    });
  });

  it('reads the state off the threshold and the sign', async () => {
    const { service } = makeService({
      ingredients: [
        sugar({ id: 1, name: 'Sugar', onHand: 25, avgUnitCost: 100, lowStockThreshold: 5 }),
        sugar({ id: 2, name: 'Flour', onHand: 4, avgUnitCost: 40, lowStockThreshold: 5 }),
        sugar({ id: 3, name: 'Oil', onHand: -1, avgUnitCost: 200, lowStockThreshold: null }),
      ],
    });
    const listed = await service.list({ branchId: 44 });
    expect(listed.tracksIngredients).toBe(true);
    expect(listed.items.map((i) => [i.name, i.state, i.stockValue])).toEqual([
      ['Flour', 'LOW', 160],
      ['Oil', 'NEGATIVE', 0],
      ['Sugar', 'OK', 2500],
    ]);
    const low = await service.lowStock(44);
    expect(low.items.map((i) => i.name)).toEqual(['Oil', 'Flour']);
  });

  it('creates an ingredient with its opening stock, and refuses a duplicate name', async () => {
    const { service, state } = makeService();
    const view = await service.create(
      {
        branchId: 44,
        name: ' Sugar ',
        unit: 'kg',
        lowStockThreshold: 5,
        openingQuantity: 25,
        openingTotalCost: 2500,
      } as any,
      manager,
    );
    expect(view.unit).toBe('KG');
    expect(view.onHand).toBe(25);
    expect(view.avgUnitCost).toBe(100);
    expect(view.stockValue).toBe(2500);
    expect(state.movements[0].movementType).toBe('OPENING');
    await expect(
      service.create({ branchId: 44, name: 'sugar', unit: 'KG' } as any, manager),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a retired name comes back as the same ingredient', async () => {
    const { service, state } = makeService({
      ingredients: [sugar({ isActive: false, onHand: 3, avgUnitCost: 90 })],
    });
    const view = await service.create(
      { branchId: 44, name: 'Sugar', unit: 'G' } as any,
      manager,
    );
    expect(view.id).toBe(7);
    expect(view.isActive).toBe(true);
    expect(view.unit).toBe('G');
    expect(state.ingredients).toHaveLength(1);
  });

  it('refuses a unit change once stock has moved', async () => {
    const { service } = makeService({
      ingredients: [sugar({ onHand: 3 })],
      movements: [{ id: 1, ingredientId: 7, movementType: 'OPENING' }],
    });
    await expect(
      service.update(7, { branchId: 44, unit: 'G' } as any, manager),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('only a manager writes', async () => {
    const { service } = makeService({ ingredients: [sugar()] });
    await expect(
      service.create({ branchId: 44, name: 'Flour', unit: 'KG' } as any, waiter),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.record(7, { branchId: 44, movementType: 'PURCHASE', quantity: 1 } as any, waiter),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.replaceRecipe(44, 4211, { branchId: 44, lines: [] } as any, waiter),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a manual receipt takes a total and a manual count takes the shelf', async () => {
    const { service } = makeService({
      ingredients: [sugar({ onHand: 25, avgUnitCost: 100 })],
    });
    const receipt = await service.record(
      7,
      { branchId: 44, movementType: 'PURCHASE', quantity: 10, totalCost: 1300 } as any,
      manager,
    );
    expect(receipt.ingredient.avgUnitCost).toBe(108.5714);
    const count = await service.record(
      7,
      { branchId: 44, movementType: 'COUNT', quantity: 30, reason: 'stocktake' } as any,
      manager,
    );
    expect(count.movement.quantityDelta).toBe(-5);
    expect(count.ingredient.onHand).toBe(30);
    await expect(
      service.record(7, { branchId: 44, movementType: 'ADJUSTMENT', quantity: 0 } as any, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('IngredientsService — recipes', () => {
  it('replaces a recipe as a set and prices the plate', async () => {
    const { service, state } = makeService({
      ingredients: [
        sugar({ id: 7, onHand: 25, avgUnitCost: 100 }),
        sugar({ id: 9, name: 'Milk', unit: 'L', avgUnitCost: 60 }),
      ],
      recipes: [{ id: 1, branchId: 44, productId: 4211, ingredientId: 9, quantity: 0.5, sortOrder: 0 }],
    });
    const out = await service.replaceRecipe(
      44,
      4211,
      { branchId: 44, lines: [{ ingredientId: 7, quantity: 0.02 }, { ingredientId: 9, quantity: 0.2 }] } as any,
      manager,
    );
    expect(out.lines).toEqual([
      { ingredientId: 7, quantity: 0.02, sortOrder: 0 },
      { ingredientId: 9, quantity: 0.2, sortOrder: 1 },
    ]);
    expect(out.plateCost).toBe(14);
    expect(state.recipes).toHaveLength(2);
  });

  it('refuses a foreign ingredient and a doubled one', async () => {
    const { service } = makeService({ ingredients: [sugar()] });
    await expect(
      service.replaceRecipe(44, 4211, { branchId: 44, lines: [{ ingredientId: 99, quantity: 1 }] } as any, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.replaceRecipe(
        44,
        4211,
        { branchId: 44, lines: [{ ingredientId: 7, quantity: 1 }, { ingredientId: 7, quantity: 2 }] } as any,
        manager,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a recipe on a format that does not track ingredients', async () => {
    const { service } = makeService({
      branch: { id: 44, serviceFormat: 'CAFETERIA' },
      ingredients: [sugar()],
    });
    await expect(
      service.replaceRecipe(44, 4211, { branchId: 44, lines: [] } as any, manager),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
