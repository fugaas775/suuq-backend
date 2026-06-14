import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { BranchInventory } from './entities/branch-inventory.entity';
import { BranchInventoryVariant } from './entities/branch-inventory-variant.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { StockMovementType } from './entities/stock-movement.entity';
import { InventoryLedgerService } from './inventory-ledger.service';

type RecordVariantMovementParams = {
  branchId: number;
  productId: number;
  variantId: number;
  quantityDelta: number;
  movementType: StockMovementType;
  sourceType: string;
  sourceReferenceId?: number | null;
  actorUserId?: number | null;
  note?: string | null;
  occurredAt?: Date | null;
};

/**
 * Per-variant stock ledger. Every movement is atomic and CASCADES to the
 * product level: it adjusts the branch_inventory_variant row AND calls
 * InventoryLedgerService.recordMovement on the parent product with the same
 * delta, so the product-level BranchInventory, Product.stockQuantity sync, and
 * the StockMovement audit stay correct with no changes to the product-level
 * surfaces. Product-level stock of a variant product is therefore always the
 * sum of its variants.
 */
@Injectable()
export class VariantInventoryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(BranchInventoryVariant)
    private readonly branchInventoryVariantRepository: Repository<BranchInventoryVariant>,
    @InjectRepository(ProductVariant)
    private readonly productVariantRepository: Repository<ProductVariant>,
    private readonly inventoryLedgerService: InventoryLedgerService,
  ) {}

  private applyVariantProjection(row: BranchInventoryVariant): void {
    const available =
      row.quantityOnHand - (row.reservedQuantity ?? 0) - (row.safetyStock ?? 0);
    row.availableToSell = available > 0 ? available : 0;
  }

  async recordVariantMovement(
    params: RecordVariantMovementParams,
    manager?: EntityManager,
  ): Promise<BranchInventoryVariant> {
    if (!manager) {
      return this.dataSource.transaction((txManager) =>
        this.recordVariantMovement(params, txManager),
      );
    }

    const variantRepo = manager.getRepository(BranchInventoryVariant);

    let row = await variantRepo.findOne({
      where: { branchId: params.branchId, variantId: params.variantId },
    });
    if (!row) {
      row = variantRepo.create({
        branchId: params.branchId,
        variantId: params.variantId,
        productId: params.productId,
        quantityOnHand: 0,
        reservedQuantity: 0,
        safetyStock: 0,
        availableToSell: 0,
        version: 0,
      });
    }

    const nextOnHand = row.quantityOnHand + params.quantityDelta;
    if (nextOnHand < 0) {
      throw new BadRequestException(
        `Variant ${params.variantId} stock at branch ${params.branchId} cannot go negative`,
      );
    }
    row.quantityOnHand = nextOnHand;
    row.version = (row.version ?? 0) + 1;
    this.applyVariantProjection(row);
    const saved = await variantRepo.save(row);

    // Cascade to the product-level ledger (keeps BranchInventory +
    // Product.stockQuantity + StockMovement audit in sync).
    if (params.quantityDelta !== 0) {
      await this.inventoryLedgerService.recordMovement(
        {
          branchId: params.branchId,
          productId: params.productId,
          movementType: params.movementType,
          quantityDelta: params.quantityDelta,
          sourceType: params.sourceType,
          sourceReferenceId: params.sourceReferenceId ?? null,
          actorUserId: params.actorUserId ?? null,
          note: params.note ?? `variant:${params.variantId}`,
          occurredAt: params.occurredAt ?? null,
        },
        manager,
      );
    }

    return saved;
  }

  /**
   * Set a variant's on-hand to an absolute target at a branch (used when seeding
   * variants from the Seller Hub grid). Computes the delta and records it.
   */
  async setVariantOnHand(
    params: {
      branchId: number;
      productId: number;
      variantId: number;
      quantity: number;
      sourceType: string;
      actorUserId?: number | null;
      note?: string | null;
    },
    manager?: EntityManager,
  ): Promise<BranchInventoryVariant> {
    if (!manager) {
      return this.dataSource.transaction((txManager) =>
        this.setVariantOnHand(params, txManager),
      );
    }
    const variantRepo = manager.getRepository(BranchInventoryVariant);
    const existing = await variantRepo.findOne({
      where: { branchId: params.branchId, variantId: params.variantId },
    });
    const current = existing?.quantityOnHand ?? 0;
    const target = Math.max(0, Math.trunc(Number(params.quantity) || 0));
    const delta = target - current;
    return this.recordVariantMovement(
      {
        branchId: params.branchId,
        productId: params.productId,
        variantId: params.variantId,
        quantityDelta: delta,
        movementType: StockMovementType.ADJUSTMENT,
        sourceType: params.sourceType,
        actorUserId: params.actorUserId ?? null,
        note: params.note ?? `variant-seed:${params.variantId}`,
      },
      manager,
    );
  }

  /**
   * Force a variant product's product-level on-hand to equal the sum of its
   * variants — the invariant for variant products. Records a corrective
   * ADJUSTMENT (preserving the audit + Product.stockQuantity sync) when they
   * drift, e.g. a product that carried independent base stock before variants
   * were seeded. A no-op when already consistent. Returns the corrected sum.
   */
  async reconcileProductFromVariants(
    branchId: number,
    productId: number,
    manager?: EntityManager,
  ): Promise<number> {
    if (!manager) {
      return this.dataSource.transaction((txManager) =>
        this.reconcileProductFromVariants(branchId, productId, txManager),
      );
    }
    const variants = await manager.getRepository(BranchInventoryVariant).find({
      where: { branchId, productId },
    });
    const variantSum = variants.reduce(
      (sum, row) => sum + (Number(row.quantityOnHand) || 0),
      0,
    );
    const inventory = await manager.getRepository(BranchInventory).findOne({
      where: { branchId, productId },
    });
    const current = Number(inventory?.quantityOnHand ?? 0);
    const delta = variantSum - current;
    if (delta !== 0) {
      await this.inventoryLedgerService.recordMovement(
        {
          branchId,
          productId,
          movementType: StockMovementType.ADJUSTMENT,
          quantityDelta: delta,
          sourceType: 'VARIANT_RECONCILE',
          note: `reconcile product on-hand to variant sum (${variantSum})`,
        },
        manager,
      );
    }
    return variantSum;
  }

  /**
   * Live per-branch variant stock for a set of products, grouped by productId.
   * Joins product_variant (definition + price) with this branch's stock rows.
   */
  async getBranchVariants(
    branchId: number,
    productIds: number[],
  ): Promise<
    Map<
      number,
      Array<{
        variantId: number;
        variantKey: string;
        attributes: Record<string, string> | null;
        priceOverride: number | null;
        availableToSell: number;
        quantityOnHand: number;
      }>
    >
  > {
    const grouped = new Map<
      number,
      Array<{
        variantId: number;
        variantKey: string;
        attributes: Record<string, string> | null;
        priceOverride: number | null;
        availableToSell: number;
        quantityOnHand: number;
      }>
    >();

    const ids = (productIds || []).filter(
      (id) => Number.isFinite(id) && id > 0,
    );
    if (!ids.length) {
      return grouped;
    }

    const variants = await this.productVariantRepository.find({
      where: { productId: In(ids), isActive: true },
      order: { id: 'ASC' },
    });
    if (!variants.length) {
      return grouped;
    }

    const stockRows = await this.branchInventoryVariantRepository.find({
      where: { branchId, productId: In(ids) },
    });
    const stockByVariantId = new Map(
      stockRows.map((row) => [row.variantId, row]),
    );

    for (const variant of variants) {
      const stock = stockByVariantId.get(variant.id);
      const list = grouped.get(variant.productId) ?? [];
      list.push({
        variantId: variant.id,
        variantKey: variant.variantKey,
        attributes: variant.attributes ?? null,
        priceOverride: variant.priceOverride ?? null,
        availableToSell: stock?.availableToSell ?? 0,
        quantityOnHand: stock?.quantityOnHand ?? 0,
      });
      grouped.set(variant.productId, list);
    }

    return grouped;
  }
}
