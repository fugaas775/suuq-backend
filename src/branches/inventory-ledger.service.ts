import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { BranchInventory } from './entities/branch-inventory.entity';
import {
  StockMovement,
  StockMovementType,
} from './entities/stock-movement.entity';
import { Branch } from './entities/branch.entity';
import { ReplenishmentService } from './replenishment.service';

type RecordMovementParams = {
  branchId: number;
  productId: number;
  movementType: StockMovementType;
  quantityDelta: number;
  sourceType: string;
  sourceReferenceId?: number | null;
  actorUserId?: number | null;
  note?: string | null;
  occurredAt?: Date | null;
  lastPurchaseOrderId?: number | null;
};

type TransferMovementParams = {
  fromBranchId: number;
  toBranchId: number;
  productId: number;
  quantity: number;
  sourceType: string;
  sourceReferenceId?: number | null;
  actorUserId?: number | null;
  note?: string | null;
};

type AdjustProjectionParams = {
  branchId: number;
  productId: number;
  quantityDelta: number;
};

@Injectable()
export class InventoryLedgerService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => ReplenishmentService))
    private readonly replenishmentService: ReplenishmentService,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(BranchInventory)
    private readonly branchInventoryRepository: Repository<BranchInventory>,
    @InjectRepository(StockMovement)
    private readonly stockMovementsRepository: Repository<StockMovement>,
  ) {}

  async getOnHand(branchId: number, productId: number): Promise<number> {
    const inventory = await this.branchInventoryRepository.findOne({
      where: { branchId, productId },
    });

    return inventory?.quantityOnHand ?? 0;
  }

  async getOnHandWithManager(
    branchId: number,
    productId: number,
    manager?: EntityManager,
  ): Promise<number> {
    if (!manager) {
      return this.getOnHand(branchId, productId);
    }

    const inventory = await manager.getRepository(BranchInventory).findOne({
      where: { branchId, productId },
    });

    return inventory?.quantityOnHand ?? 0;
  }

  async getAvailability(
    branchId: number,
    productId: number,
  ): Promise<BranchInventory | null> {
    return this.branchInventoryRepository.findOne({
      where: { branchId, productId },
    });
  }

  async adjustInboundOpenPo(
    params: AdjustProjectionParams,
    manager?: EntityManager,
  ): Promise<BranchInventory> {
    await this.ensureBranchAndProduct(
      params.branchId,
      params.productId,
      manager,
    );
    return this.adjustProjectionBucket('inboundOpenPo', params, manager);
  }

  async adjustReservedOnline(
    params: AdjustProjectionParams,
    manager?: EntityManager,
  ): Promise<BranchInventory> {
    await this.ensureBranchAndProduct(
      params.branchId,
      params.productId,
      manager,
    );
    return this.adjustProjectionBucket('reservedOnline', params, manager);
  }

  async adjustOutboundTransfers(
    params: AdjustProjectionParams,
    manager?: EntityManager,
  ): Promise<BranchInventory> {
    await this.ensureBranchAndProduct(
      params.branchId,
      params.productId,
      manager,
    );
    return this.adjustProjectionBucket('outboundTransfers', params, manager);
  }

  async recordMovement(
    params: RecordMovementParams,
    manager?: EntityManager,
  ): Promise<{ inventory: BranchInventory; movement: StockMovement }> {
    const inventoryRepository =
      manager?.getRepository(BranchInventory) ?? this.branchInventoryRepository;
    const stockMovementRepository =
      manager?.getRepository(StockMovement) ?? this.stockMovementsRepository;

    if (params.quantityDelta === 0) {
      let inventory = await inventoryRepository.findOne({
        where: { branchId: params.branchId, productId: params.productId },
      });

      if (!inventory) {
        inventory = inventoryRepository.create({
          branchId: params.branchId,
          productId: params.productId,
          quantityOnHand: 0,
          reservedQuantity: 0,
          reservedOnline: 0,
          reservedStoreOps: 0,
          inboundOpenPo: 0,
          outboundTransfers: 0,
          safetyStock: 0,
          availableToSell: 0,
          version: 0,
        });
        this.applyAvailabilityProjection(inventory);
        inventory = await inventoryRepository.save(inventory);
      }

      return {
        inventory,
        movement: stockMovementRepository.create({
          branchId: params.branchId,
          productId: params.productId,
          movementType: params.movementType,
          quantityDelta: 0,
          sourceType: params.sourceType,
          sourceReferenceId: params.sourceReferenceId ?? null,
          actorUserId: params.actorUserId ?? null,
          note: params.note ?? null,
        }),
      };
    }

    await this.ensureBranchAndProduct(
      params.branchId,
      params.productId,
      manager,
    );

    if (manager) {
      return this.recordMovementWithManager(manager, params);
    }

    return this.dataSource.transaction(async (manager) => {
      return this.recordMovementWithManager(manager, params);
    });
  }

  async transferStock(params: TransferMovementParams): Promise<void> {
    if (params.quantity <= 0) {
      throw new BadRequestException(
        'Transfer quantity must be greater than zero',
      );
    }

    if (params.fromBranchId === params.toBranchId) {
      throw new BadRequestException('Transfer branches must be different');
    }

    await this.ensureBranchAndProduct(params.fromBranchId, params.productId);
    await this.ensureBranchAndProduct(params.toBranchId, params.productId);

    await this.dataSource.transaction(async (manager) => {
      const inventoryRepository = manager.getRepository(BranchInventory);
      const stockMovementRepository = manager.getRepository(StockMovement);

      const debitInventory = await this.loadOrCreateInventory(
        inventoryRepository,
        params.fromBranchId,
        params.productId,
      );
      const creditInventory = await this.loadOrCreateInventory(
        inventoryRepository,
        params.toBranchId,
        params.productId,
      );

      if (debitInventory.quantityOnHand < params.quantity) {
        throw new BadRequestException(
          `Branch ${params.fromBranchId} does not have enough stock to transfer ${params.quantity} units of product ${params.productId}`,
        );
      }

      debitInventory.outboundTransfers += params.quantity;
      this.applyAvailabilityProjection(debitInventory);
      await inventoryRepository.save(debitInventory);

      debitInventory.quantityOnHand -= params.quantity;
      debitInventory.outboundTransfers = Math.max(
        debitInventory.outboundTransfers - params.quantity,
        0,
      );
      debitInventory.version = (debitInventory.version ?? 0) + 1;
      this.applyAvailabilityProjection(debitInventory);

      creditInventory.quantityOnHand += params.quantity;
      creditInventory.version = (creditInventory.version ?? 0) + 1;
      this.applyAvailabilityProjection(creditInventory);

      await inventoryRepository.save(debitInventory);
      await inventoryRepository.save(creditInventory);

      await stockMovementRepository.save(
        stockMovementRepository.create({
          branchId: params.fromBranchId,
          productId: params.productId,
          movementType: StockMovementType.TRANSFER,
          quantityDelta: -params.quantity,
          sourceType: params.sourceType,
          sourceReferenceId: params.sourceReferenceId ?? null,
          actorUserId: params.actorUserId ?? null,
          note: params.note
            ? `${params.note} | transfer-to:${params.toBranchId}`
            : `transfer-to:${params.toBranchId}`,
        }),
      );

      await stockMovementRepository.save(
        stockMovementRepository.create({
          branchId: params.toBranchId,
          productId: params.productId,
          movementType: StockMovementType.TRANSFER,
          quantityDelta: params.quantity,
          sourceType: params.sourceType,
          sourceReferenceId: params.sourceReferenceId ?? null,
          actorUserId: params.actorUserId ?? null,
          note: params.note
            ? `${params.note} | transfer-from:${params.fromBranchId}`
            : `transfer-from:${params.fromBranchId}`,
        }),
      );
    });
  }

  private async ensureBranchAndProduct(
    branchId: number,
    productId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const branchesRepository =
      manager?.getRepository(Branch) ?? this.branchesRepository;
    const productsRepository =
      manager?.getRepository(Product) ?? this.productsRepository;

    const [branch, product] = await Promise.all([
      branchesRepository.findOne({ where: { id: branchId } }),
      productsRepository.findOne({ where: { id: productId } }),
    ]);

    if (!branch) {
      throw new NotFoundException(`Branch with ID ${branchId} not found`);
    }

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }
  }

  private async loadOrCreateInventory(
    inventoryRepository: Repository<BranchInventory>,
    branchId: number,
    productId: number,
  ): Promise<BranchInventory> {
    const inventory = await inventoryRepository.findOne({
      where: { branchId, productId },
    });

    if (inventory) {
      return inventory;
    }

    return inventoryRepository.create({
      branchId,
      productId,
      quantityOnHand: 0,
      reservedQuantity: 0,
      reservedOnline: 0,
      reservedStoreOps: 0,
      inboundOpenPo: 0,
      outboundTransfers: 0,
      safetyStock: 0,
      availableToSell: 0,
      version: 0,
    });
  }

  private async recordMovementWithManager(
    manager: EntityManager,
    params: RecordMovementParams,
  ): Promise<{ inventory: BranchInventory; movement: StockMovement }> {
    const inventoryRepository = manager.getRepository(BranchInventory);
    const stockMovementRepository = manager.getRepository(StockMovement);

    let inventory = await inventoryRepository.findOne({
      where: {
        branchId: params.branchId,
        productId: params.productId,
      },
    });

    if (!inventory) {
      inventory = inventoryRepository.create({
        branchId: params.branchId,
        productId: params.productId,
        quantityOnHand: 0,
        reservedQuantity: 0,
        reservedOnline: 0,
        reservedStoreOps: 0,
        inboundOpenPo: 0,
        outboundTransfers: 0,
        safetyStock: 0,
        availableToSell: 0,
        version: 0,
      });
    }

    const nextOnHand = inventory.quantityOnHand + params.quantityDelta;
    if (nextOnHand < 0) {
      throw new BadRequestException(
        `Inventory for branch ${params.branchId} and product ${params.productId} cannot go negative`,
      );
    }

    inventory.quantityOnHand = nextOnHand;
    inventory.version = (inventory.version ?? 0) + 1;
    if (params.movementType === StockMovementType.PURCHASE_RECEIPT) {
      inventory.lastReceivedAt = params.occurredAt ?? new Date();
      inventory.lastPurchaseOrderId = params.lastPurchaseOrderId ?? null;
    }

    this.applyAvailabilityProjection(inventory);

    const savedInventory = await inventoryRepository.save(inventory);
    const movement = await stockMovementRepository.save(
      stockMovementRepository.create({
        branchId: params.branchId,
        productId: params.productId,
        movementType: params.movementType,
        quantityDelta: params.quantityDelta,
        sourceType: params.sourceType,
        sourceReferenceId: params.sourceReferenceId ?? null,
        actorUserId: params.actorUserId ?? null,
        note: params.note ?? null,
      }),
    );

    await this.maybeEvaluateReplenishment(savedInventory, params, manager);

    return { inventory: savedInventory, movement };
  }

  private async maybeEvaluateReplenishment(
    inventory: BranchInventory,
    params: RecordMovementParams,
    manager: EntityManager,
  ): Promise<void> {
    const trigger = this.resolveReplenishmentTrigger(params);
    if (!trigger) {
      return;
    }

    await this.replenishmentService.maybeCreateDraftPurchaseOrder(
      inventory,
      {
        actorUserId: params.actorUserId ?? null,
        trigger,
      },
      manager,
    );
  }

  private resolveReplenishmentTrigger(
    params: RecordMovementParams,
  ): 'POS_SYNC' | 'INVENTORY_ADJUSTMENT' | null {
    if (params.sourceType === 'POS_SYNC') {
      return 'POS_SYNC';
    }

    if (params.movementType === StockMovementType.ADJUSTMENT) {
      return 'INVENTORY_ADJUSTMENT';
    }

    return null;
  }

  private async adjustProjectionBucket(
    bucket: 'inboundOpenPo' | 'reservedOnline' | 'outboundTransfers',
    params: AdjustProjectionParams,
    manager?: EntityManager,
  ): Promise<BranchInventory> {
    const inventoryRepository =
      manager?.getRepository(BranchInventory) ?? this.branchInventoryRepository;

    let inventory = await inventoryRepository.findOne({
      where: {
        branchId: params.branchId,
        productId: params.productId,
      },
    });

    if (!inventory) {
      inventory = inventoryRepository.create({
        branchId: params.branchId,
        productId: params.productId,
        quantityOnHand: 0,
        reservedQuantity: 0,
        reservedOnline: 0,
        reservedStoreOps: 0,
        inboundOpenPo: 0,
        outboundTransfers: 0,
        safetyStock: 0,
        availableToSell: 0,
        version: 0,
      });
    }

    const nextValue = (inventory[bucket] ?? 0) + params.quantityDelta;
    if (nextValue < 0) {
      throw new BadRequestException(
        `${bucket} for branch ${params.branchId} and product ${params.productId} cannot go negative`,
      );
    }

    inventory[bucket] = nextValue;
    inventory.version = (inventory.version ?? 0) + 1;
    this.applyAvailabilityProjection(inventory);

    return inventoryRepository.save(inventory);
  }

  private applyAvailabilityProjection(inventory: BranchInventory): void {
    const availableToSell =
      inventory.quantityOnHand -
      (inventory.reservedQuantity ?? 0) -
      (inventory.reservedOnline ?? 0) -
      (inventory.reservedStoreOps ?? 0) -
      (inventory.outboundTransfers ?? 0) -
      (inventory.safetyStock ?? 0);

    inventory.availableToSell = Math.max(availableToSell, 0);
  }
}
