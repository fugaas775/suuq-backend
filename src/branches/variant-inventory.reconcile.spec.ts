import { VariantInventoryService } from './variant-inventory.service';
import { BranchInventory } from './entities/branch-inventory.entity';
import { BranchInventoryVariant } from './entities/branch-inventory-variant.entity';
import { StockMovementType } from './entities/stock-movement.entity';

function makeService(opts: {
  variants: Array<{ quantityOnHand: number }>;
  productOnHand: number | null;
}) {
  const inventoryLedger = { recordMovement: jest.fn().mockResolvedValue({}) };
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === BranchInventoryVariant) {
        return { find: jest.fn().mockResolvedValue(opts.variants) };
      }
      if (entity === BranchInventory) {
        return {
          findOne: jest
            .fn()
            .mockResolvedValue(
              opts.productOnHand == null
                ? null
                : { quantityOnHand: opts.productOnHand },
            ),
        };
      }
      return {};
    },
  };
  const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };
  const service = new VariantInventoryService(
    dataSource as never,
    null as never,
    null as never,
    inventoryLedger as never,
  );
  return { service, inventoryLedger };
}

describe('VariantInventoryService.reconcileProductFromVariants', () => {
  it('corrects a product whose on-hand exceeds the variant sum (the reported bug)', async () => {
    const { service, inventoryLedger } = makeService({
      variants: [{ quantityOnHand: 0 }, { quantityOnHand: 0 }],
      productOnHand: 5, // "5 left" while every variant is out of stock
    });

    const sum = await service.reconcileProductFromVariants(92, 7);

    expect(sum).toBe(0);
    expect(inventoryLedger.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 92,
        productId: 7,
        quantityDelta: -5, // pull product on-hand down to the variant sum (0)
        movementType: StockMovementType.ADJUSTMENT,
        sourceType: 'VARIANT_RECONCILE',
      }),
      expect.anything(),
    );
  });

  it('records an increase when the product trails the variant sum', async () => {
    const { service, inventoryLedger } = makeService({
      variants: [{ quantityOnHand: 4 }, { quantityOnHand: 6 }],
      productOnHand: 3,
    });

    const sum = await service.reconcileProductFromVariants(92, 7);

    expect(sum).toBe(10);
    expect(inventoryLedger.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ quantityDelta: 7 }),
      expect.anything(),
    );
  });

  it('is a no-op when product on-hand already equals the variant sum', async () => {
    const { service, inventoryLedger } = makeService({
      variants: [{ quantityOnHand: 2 }, { quantityOnHand: 3 }],
      productOnHand: 5,
    });

    const sum = await service.reconcileProductFromVariants(92, 7);

    expect(sum).toBe(5);
    expect(inventoryLedger.recordMovement).not.toHaveBeenCalled();
  });
});
