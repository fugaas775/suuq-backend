import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { BranchInventory } from './entities/branch-inventory.entity';
import {
  BranchTransfer,
  BranchTransferItem,
  BranchTransferStatus,
} from './entities/branch-transfer.entity';
import { Branch } from './entities/branch.entity';
import { InventoryLedgerService } from './inventory-ledger.service';
import { Product } from '../products/entities/product.entity';
import { StockMovementType } from './entities/stock-movement.entity';
import { CreateBranchTransferDto } from './dto/create-branch-transfer.dto';
import { ListBranchTransfersQueryDto } from './dto/list-branch-transfers-query.dto';
import { ReplenishmentService } from './replenishment.service';

type BranchTransferActor = {
  id?: number | null;
  email?: string | null;
  roles?: string[];
};

type BranchTransferSource = {
  sourceType?: string | null;
  sourceReferenceId?: number | null;
  sourceEntryIndex?: number | null;
};

@Injectable()
export class BranchTransfersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly inventoryLedgerService: InventoryLedgerService,
    private readonly replenishmentService: ReplenishmentService,
    @InjectRepository(BranchTransfer)
    private readonly branchTransfersRepository: Repository<BranchTransfer>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  async create(
    dto: CreateBranchTransferDto,
    actor?: BranchTransferActor,
    source?: BranchTransferSource,
  ): Promise<BranchTransfer> {
    await this.assertTransferDraftIsValid(dto);

    const now = new Date();
    const transfer = this.branchTransfersRepository.create({
      transferNumber: `BT-${Date.now()}`,
      fromBranchId: dto.fromBranchId,
      toBranchId: dto.toBranchId,
      status: BranchTransferStatus.REQUESTED,
      note: dto.note ?? null,
      sourceType: source?.sourceType ?? null,
      sourceReferenceId: source?.sourceReferenceId ?? null,
      sourceEntryIndex: source?.sourceEntryIndex ?? null,
      requestedByUserId: actor?.id ?? null,
      requestedAt: now,
      statusMeta: {
        lastTransition: {
          toStatus: BranchTransferStatus.REQUESTED,
          actorId: actor?.id ?? null,
          at: now.toISOString(),
        },
      },
      items: dto.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        note: item.note ?? null,
      })) as BranchTransferItem[],
    });

    return this.branchTransfersRepository.save(transfer);
  }

  async findBySource(
    sourceType: string,
    sourceReferenceId: number,
    fromBranchId?: number,
  ): Promise<BranchTransfer[]> {
    const qb = this.branchTransfersRepository
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.items', 'items')
      .where('transfer.sourceType = :sourceType', { sourceType })
      .andWhere('transfer.sourceReferenceId = :sourceReferenceId', {
        sourceReferenceId,
      })
      .orderBy('transfer.sourceEntryIndex', 'ASC', 'NULLS LAST')
      .addOrderBy('transfer.id', 'ASC');

    if (fromBranchId != null) {
      qb.andWhere('transfer.fromBranchId = :fromBranchId', { fromBranchId });
    }

    return qb.getMany();
  }

  async findAll(query: ListBranchTransfersQueryDto): Promise<{
    items: BranchTransfer[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }> {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.limit ?? 20, 1), 200);

    const qb = this.branchTransfersRepository
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.fromBranch', 'fromBranch')
      .leftJoinAndSelect('transfer.toBranch', 'toBranch')
      .leftJoinAndSelect('transfer.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .orderBy('transfer.createdAt', 'DESC')
      .addOrderBy('transfer.id', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);

    if (query.fromBranchId != null) {
      qb.andWhere('transfer.fromBranchId = :fromBranchId', {
        fromBranchId: query.fromBranchId,
      });
    }

    if (query.toBranchId != null) {
      qb.andWhere('transfer.toBranchId = :toBranchId', {
        toBranchId: query.toBranchId,
      });
    }

    if (query.status) {
      qb.andWhere('transfer.status = :status', { status: query.status });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async findOne(id: number): Promise<BranchTransfer> {
    const transfer = await this.branchTransfersRepository.findOne({
      where: { id },
      relations: {
        fromBranch: true,
        toBranch: true,
        items: { product: true },
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Branch transfer with ID ${id} not found`);
    }

    return transfer;
  }

  async dispatch(id: number, actor?: BranchTransferActor, note?: string) {
    const transfer = await this.findOne(id);
    if (transfer.status !== BranchTransferStatus.REQUESTED) {
      throw new BadRequestException(
        'Only requested branch transfers can be dispatched',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const inventoryRepository = manager.getRepository(BranchInventory);

      for (const item of transfer.items) {
        const inventory = await inventoryRepository.findOne({
          where: {
            branchId: transfer.fromBranchId,
            productId: item.productId,
          },
        });

        const availableToSell = Math.max(
          (inventory?.quantityOnHand ?? 0) -
            (inventory?.reservedQuantity ?? 0) -
            (inventory?.reservedOnline ?? 0) -
            (inventory?.reservedStoreOps ?? 0) -
            (inventory?.outboundTransfers ?? 0) -
            (inventory?.safetyStock ?? 0),
          0,
        );

        if (availableToSell < item.quantity) {
          throw new BadRequestException(
            `Branch ${transfer.fromBranchId} has only ${availableToSell} units available to transfer for product ${item.productId}`,
          );
        }

        const projectedInventory =
          await this.inventoryLedgerService.adjustOutboundTransfers(
            {
              branchId: transfer.fromBranchId,
              productId: item.productId,
              quantityDelta: item.quantity,
            },
            manager,
          );

        await this.replenishmentService.maybeCreateDraftPurchaseOrder(
          projectedInventory,
          {
            actorUserId: actor?.id ?? null,
            sourceTransferId: transfer.id,
            trigger: 'DISPATCHED_TRANSFER',
          },
          manager,
        );
      }

      transfer.status = BranchTransferStatus.DISPATCHED;
      transfer.dispatchedAt = new Date();
      transfer.dispatchedByUserId = actor?.id ?? null;
      transfer.note = note ?? transfer.note ?? null;
      transfer.statusMeta = this.buildStatusMeta(
        transfer.statusMeta,
        BranchTransferStatus.REQUESTED,
        BranchTransferStatus.DISPATCHED,
        actor?.id ?? null,
        note,
      );

      return manager.getRepository(BranchTransfer).save(transfer);
    });
  }

  async receive(id: number, actor?: BranchTransferActor, note?: string) {
    const transfer = await this.findOne(id);
    if (transfer.status !== BranchTransferStatus.DISPATCHED) {
      throw new BadRequestException(
        'Only dispatched branch transfers can be received',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      for (const item of transfer.items) {
        await this.inventoryLedgerService.adjustOutboundTransfers(
          {
            branchId: transfer.fromBranchId,
            productId: item.productId,
            quantityDelta: -item.quantity,
          },
          manager,
        );

        await this.inventoryLedgerService.recordMovement(
          {
            branchId: transfer.fromBranchId,
            productId: item.productId,
            movementType: StockMovementType.TRANSFER,
            quantityDelta: -item.quantity,
            sourceType: 'BRANCH_TRANSFER',
            sourceReferenceId: transfer.id,
            actorUserId: actor?.id ?? null,
            note: note
              ? `${note} | transfer-to:${transfer.toBranchId}`
              : `transfer-to:${transfer.toBranchId}`,
          },
          manager,
        );

        await this.inventoryLedgerService.recordMovement(
          {
            branchId: transfer.toBranchId,
            productId: item.productId,
            movementType: StockMovementType.TRANSFER,
            quantityDelta: item.quantity,
            sourceType: 'BRANCH_TRANSFER',
            sourceReferenceId: transfer.id,
            actorUserId: actor?.id ?? null,
            note: note
              ? `${note} | transfer-from:${transfer.fromBranchId}`
              : `transfer-from:${transfer.fromBranchId}`,
          },
          manager,
        );
      }

      transfer.status = BranchTransferStatus.RECEIVED;
      transfer.receivedAt = new Date();
      transfer.receivedByUserId = actor?.id ?? null;
      transfer.note = note ?? transfer.note ?? null;
      transfer.statusMeta = this.buildStatusMeta(
        transfer.statusMeta,
        BranchTransferStatus.DISPATCHED,
        BranchTransferStatus.RECEIVED,
        actor?.id ?? null,
        note,
      );

      return manager.getRepository(BranchTransfer).save(transfer);
    });
  }

  async cancel(id: number, actor?: BranchTransferActor, note?: string) {
    const transfer = await this.findOne(id);
    if (
      transfer.status !== BranchTransferStatus.REQUESTED &&
      transfer.status !== BranchTransferStatus.DISPATCHED
    ) {
      throw new BadRequestException(
        'Only requested or dispatched branch transfers can be cancelled',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      if (transfer.status === BranchTransferStatus.DISPATCHED) {
        for (const item of transfer.items) {
          await this.inventoryLedgerService.adjustOutboundTransfers(
            {
              branchId: transfer.fromBranchId,
              productId: item.productId,
              quantityDelta: -item.quantity,
            },
            manager,
          );
        }
      }

      const previousStatus = transfer.status;
      transfer.status = BranchTransferStatus.CANCELLED;
      transfer.cancelledAt = new Date();
      transfer.cancelledByUserId = actor?.id ?? null;
      transfer.note = note ?? transfer.note ?? null;
      transfer.statusMeta = this.buildStatusMeta(
        transfer.statusMeta,
        previousStatus,
        BranchTransferStatus.CANCELLED,
        actor?.id ?? null,
        note,
      );

      return manager.getRepository(BranchTransfer).save(transfer);
    });
  }

  private async assertTransferDraftIsValid(
    dto: CreateBranchTransferDto,
  ): Promise<void> {
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException(
        'Branch transfer origin and destination must be different',
      );
    }

    const distinctProductIds = [
      ...new Set(dto.items.map((item) => item.productId)),
    ];
    if (distinctProductIds.length !== dto.items.length) {
      throw new BadRequestException(
        'Branch transfer items must not contain duplicate productIds',
      );
    }

    const [fromBranch, toBranch, products] = await Promise.all([
      this.branchesRepository.findOne({ where: { id: dto.fromBranchId } }),
      this.branchesRepository.findOne({ where: { id: dto.toBranchId } }),
      this.productsRepository.findBy({ id: In(distinctProductIds) }),
    ]);

    if (!fromBranch) {
      throw new NotFoundException(
        `Branch with ID ${dto.fromBranchId} not found`,
      );
    }

    if (!toBranch) {
      throw new NotFoundException(`Branch with ID ${dto.toBranchId} not found`);
    }

    if (products.length !== distinctProductIds.length) {
      throw new NotFoundException(
        'One or more branch transfer products were not found',
      );
    }
  }

  private buildStatusMeta(
    current: Record<string, any> | null | undefined,
    fromStatus: BranchTransferStatus,
    toStatus: BranchTransferStatus,
    actorId: number | null,
    note?: string,
  ): Record<string, any> {
    return {
      ...(current ?? {}),
      lastTransition: {
        fromStatus,
        toStatus,
        actorId,
        note: note ?? null,
        at: new Date().toISOString(),
      },
    };
  }
}
