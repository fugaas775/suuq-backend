import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import {
  StockMovement,
  StockMovementType,
} from '../branches/entities/stock-movement.entity';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { StockCount } from './entities/stock-count.entity';
import {
  RetailStockAdjustmentDto,
  RetailStockAdjustmentHistoryResponseDto,
  RetailStockAdjustmentResponseDto,
  RetailStockAdjustmentsQueryDto,
} from './dto/retail-stock-adjustment.dto';
import {
  RetailStockCountDto,
  RetailStockCountResponseDto,
  RetailStockCountResultLineDto,
  RetailStockCountsHistoryResponseDto,
  RetailStockCountsQueryDto,
} from './dto/retail-stock-count.dto';
import {
  RetailParLevelDto,
  RetailParLevelsQueryDto,
  RetailParLevelsResponseDto,
  RetailUpdateParLevelsDto,
  RetailUpdateParLevelsResponseDto,
} from './dto/retail-par-levels.dto';

const MANUAL_ADJUSTMENT_SOURCE = 'MANUAL_ADJUSTMENT';
const STOCK_COUNT_SOURCE = 'STOCK_COUNT';

@Injectable()
export class RetailInventoryOpsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly inventoryLedger: InventoryLedgerService,
    @InjectRepository(BranchInventory)
    private readonly branchInventoryRepository: Repository<BranchInventory>,
    @InjectRepository(StockMovement)
    private readonly stockMovementsRepository: Repository<StockMovement>,
    @InjectRepository(StockCount)
    private readonly stockCountsRepository: Repository<StockCount>,
  ) {}

  // ── Stock adjustments (waste / shrinkage / found) ──────────────────────────

  async adjustStock(
    branchId: number,
    dto: RetailStockAdjustmentDto,
    actorUserId: number | null,
  ): Promise<RetailStockAdjustmentResponseDto> {
    if (!dto.quantityDelta) {
      throw new BadRequestException('quantityDelta must be a non-zero integer');
    }

    const previousQuantity = await this.inventoryLedger.getOnHand(
      branchId,
      dto.productId,
    );

    const { inventory, movement } = await this.inventoryLedger.recordMovement({
      branchId,
      productId: dto.productId,
      movementType: StockMovementType.ADJUSTMENT,
      quantityDelta: dto.quantityDelta,
      sourceType: MANUAL_ADJUSTMENT_SOURCE,
      actorUserId: actorUserId ?? null,
      note: this.encodeNote(dto.reason, dto.note),
    });

    return {
      adjustmentId: movement.id,
      branchId,
      productId: dto.productId,
      previousQuantity,
      quantityDelta: dto.quantityDelta,
      newQuantity: inventory.quantityOnHand,
      reason: dto.reason,
      note: dto.note ?? null,
      adjustedByUserId: actorUserId ?? null,
      adjustedAt: movement.createdAt,
    };
  }

  async getStockAdjustments(
    query: RetailStockAdjustmentsQueryDto,
  ): Promise<RetailStockAdjustmentHistoryResponseDto> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);

    const where: Record<string, unknown> = {
      branchId: query.branchId,
      movementType: StockMovementType.ADJUSTMENT,
      sourceType: MANUAL_ADJUSTMENT_SOURCE,
    };
    if (query.productId) {
      where.productId = query.productId;
    }

    const [rows, total] = await this.stockMovementsRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return {
      items: rows.map((movement) => {
        const { reason, note } = this.decodeNote(movement.note);
        return {
          adjustmentId: movement.id,
          productId: movement.productId,
          quantityDelta: movement.quantityDelta,
          reason,
          note,
          adjustedByUserId: movement.actorUserId ?? null,
          adjustedAt: movement.createdAt,
        };
      }),
      total,
    };
  }

  // ── Physical / cycle counts ────────────────────────────────────────────────

  async countStock(
    branchId: number,
    dto: RetailStockCountDto,
    actorUserId: number | null,
  ): Promise<RetailStockCountResponseDto> {
    const countType = dto.countType ?? 'CYCLE';

    return this.dataSource.transaction(async (manager) => {
      const countRepo = manager.getRepository(StockCount);
      const header = await countRepo.save(
        countRepo.create({
          branchId,
          countType,
          note: dto.note ?? null,
          countedByUserId: actorUserId ?? null,
          lineCount: dto.lines.length,
          totalVariance: 0,
        }),
      );

      const lines: RetailStockCountResultLineDto[] = [];
      let totalVariance = 0;

      for (const line of dto.lines) {
        const expectedQuantity =
          await this.inventoryLedger.getOnHandWithManager(
            branchId,
            line.productId,
            manager,
          );
        const variance = line.countedQuantity - expectedQuantity;

        if (variance !== 0) {
          await this.inventoryLedger.recordMovement(
            {
              branchId,
              productId: line.productId,
              movementType: StockMovementType.ADJUSTMENT,
              quantityDelta: variance,
              sourceType: STOCK_COUNT_SOURCE,
              sourceReferenceId: header.id,
              actorUserId: actorUserId ?? null,
              note: 'RECOUNT',
            },
            manager,
          );
          totalVariance += Math.abs(variance);
        }

        lines.push({
          productId: line.productId,
          expectedQuantity,
          countedQuantity: line.countedQuantity,
          variance,
          newQuantityOnHand: line.countedQuantity,
        });
      }

      header.totalVariance = totalVariance;
      await countRepo.save(header);

      return {
        countId: header.id,
        branchId,
        countType,
        countedAt: header.createdAt,
        lineCount: dto.lines.length,
        totalVariance,
        lines,
      };
    });
  }

  async getStockCounts(
    query: RetailStockCountsQueryDto,
  ): Promise<RetailStockCountsHistoryResponseDto> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const [rows, total] = await this.stockCountsRepository.findAndCount({
      where: { branchId: query.branchId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return {
      items: rows.map((count) => ({
        countId: count.id,
        branchId: count.branchId,
        countType: count.countType,
        note: count.note ?? null,
        lineCount: count.lineCount,
        totalVariance: count.totalVariance,
        countedByUserId: count.countedByUserId ?? null,
        countedAt: count.createdAt,
      })),
      total,
    };
  }

  // ── Par levels & reorder points ────────────────────────────────────────────

  async getParLevels(
    query: RetailParLevelsQueryDto,
  ): Promise<RetailParLevelsResponseDto> {
    const page = Math.max(query.page ?? 1, 1);
    const perPage = Math.min(Math.max(query.limit ?? 100, 1), 200);

    const [rows, total] = await this.branchInventoryRepository.findAndCount({
      where: { branchId: query.branchId },
      order: { productId: 'ASC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    return {
      items: rows.map((row) => this.mapParLevel(row)),
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage) || 0,
    };
  }

  async updateParLevels(
    branchId: number,
    dto: RetailUpdateParLevelsDto,
  ): Promise<RetailUpdateParLevelsResponseDto> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const inventoryRepo = manager.getRepository(BranchInventory);
      const result: BranchInventory[] = [];

      for (const level of dto.levels) {
        let inventory = await inventoryRepo.findOne({
          where: { branchId, productId: level.productId },
        });
        if (!inventory) {
          inventory = inventoryRepo.create({
            branchId,
            productId: level.productId,
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
        inventory.parLevel = level.parLevel;
        inventory.reorderPoint = level.reorderPoint;
        result.push(await inventoryRepo.save(inventory));
      }

      return result;
    });

    return {
      updated: saved.length,
      items: saved.map((row) => this.mapParLevel(row)),
    };
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  private mapParLevel(row: BranchInventory): RetailParLevelDto {
    return {
      productId: row.productId,
      parLevel: row.parLevel ?? 0,
      reorderPoint: row.reorderPoint ?? 0,
      currentQuantity: row.quantityOnHand ?? 0,
      availableToSell: row.availableToSell ?? 0,
    };
  }

  private encodeNote(reason: string, note?: string | null): string {
    const trimmedReason = String(reason || '').trim() || 'ADJUSTMENT';
    const trimmedNote = String(note || '').trim();
    return trimmedNote ? `${trimmedReason} | ${trimmedNote}` : trimmedReason;
  }

  private decodeNote(raw?: string | null): {
    reason: string;
    note: string | null;
  } {
    const value = String(raw || '').trim();
    if (!value) {
      return { reason: 'ADJUSTMENT', note: null };
    }
    const separator = value.indexOf(' | ');
    if (separator === -1) {
      return { reason: value, note: null };
    }
    return {
      reason: value.slice(0, separator).trim(),
      note: value.slice(separator + 3).trim() || null,
    };
  }
}
