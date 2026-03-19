import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchTransfersService } from '../branches/branch-transfers.service';
import { StockMovementType } from '../branches/entities/stock-movement.entity';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';
import { Branch } from '../branches/entities/branch.entity';
import { PartnerCredential } from '../partner-credentials/entities/partner-credential.entity';
import { ProductAliasesService } from '../product-aliases/product-aliases.service';
import { CreatePosSyncJobDto } from './dto/create-pos-sync-job.dto';
import { IngestPosSyncDto, PosSyncEntryDto } from './dto/ingest-pos-sync.dto';
import { PosSyncTransferConfirmationResponseDto } from './dto/pos-sync-transfer-confirmation-response.dto';
import { ReplayPosSyncFailuresDto } from './dto/replay-pos-sync-failures.dto';
import { UpdatePosSyncJobStatusDto } from './dto/update-pos-sync-job-status.dto';
import {
  PosSyncFailedEntry,
  PosSyncJob,
  PosSyncStatus,
} from './entities/pos-sync-job.entity';

const POS_SYNC_TRANSITIONS: Record<PosSyncStatus, PosSyncStatus[]> = {
  [PosSyncStatus.RECEIVED]: [PosSyncStatus.PROCESSED, PosSyncStatus.FAILED],
  [PosSyncStatus.PROCESSED]: [],
  [PosSyncStatus.FAILED]: [PosSyncStatus.RECEIVED],
};

@Injectable()
export class PosSyncService {
  constructor(
    @InjectRepository(PosSyncJob)
    private readonly posSyncJobsRepository: Repository<PosSyncJob>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(PartnerCredential)
    private readonly partnerCredentialsRepository: Repository<PartnerCredential>,
    private readonly branchTransfersService: BranchTransfersService,
    private readonly inventoryLedgerService: InventoryLedgerService,
    private readonly productAliasesService: ProductAliasesService,
  ) {}

  async create(dto: CreatePosSyncJobDto): Promise<PosSyncJob> {
    if (dto.branchId == null && dto.partnerCredentialId == null) {
      throw new BadRequestException(
        'A POS sync job must reference a branch or partner credential',
      );
    }

    if (dto.branchId != null) {
      const branch = await this.branchesRepository.findOne({
        where: { id: dto.branchId },
      });
      if (!branch) {
        throw new NotFoundException(`Branch with ID ${dto.branchId} not found`);
      }
    }

    if (dto.partnerCredentialId != null) {
      const partnerCredential = await this.partnerCredentialsRepository.findOne(
        {
          where: { id: dto.partnerCredentialId },
        },
      );
      if (!partnerCredential) {
        throw new NotFoundException(
          `Partner credential with ID ${dto.partnerCredentialId} not found`,
        );
      }
    }

    const syncJob = this.posSyncJobsRepository.create({
      ...dto,
      externalJobId: dto.externalJobId?.trim() || null,
      idempotencyKey: dto.idempotencyKey?.trim() || null,
      status: PosSyncStatus.RECEIVED,
      acceptedCount: dto.acceptedCount ?? 0,
      rejectedCount: dto.rejectedCount ?? 0,
      failedEntries: [],
    });
    await this.posSyncJobsRepository.save(syncJob);
    return this.findOneById(syncJob.id);
  }

  async findAll(): Promise<PosSyncJob[]> {
    return this.posSyncJobsRepository.find({
      order: { createdAt: 'DESC' },
      relations: { branch: true, partnerCredential: true },
    });
  }

  async ingest(
    dto: IngestPosSyncDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
  ): Promise<PosSyncJob> {
    const existingJob = await this.findExistingJobForIdempotency(dto);
    if (existingJob) {
      return this.findOneById(existingJob.id);
    }

    const syncJob = await this.create({
      branchId: dto.branchId,
      partnerCredentialId: dto.partnerCredentialId,
      syncType: dto.syncType,
      externalJobId: dto.externalJobId,
      idempotencyKey: dto.idempotencyKey,
      acceptedCount: 0,
      rejectedCount: 0,
    });

    let acceptedCount = 0;
    let rejectedCount = 0;
    const failedEntries: PosSyncFailedEntry[] = [];

    for (const [entryIndex, entry] of dto.entries.entries()) {
      try {
        await this.processInventoryEntry(
          syncJob,
          dto,
          entry,
          entryIndex,
          actor.id ?? null,
        );
        acceptedCount += 1;
      } catch (error) {
        rejectedCount += 1;
        failedEntries.push(this.toFailedEntry(entryIndex, entry, error));
      }
    }

    syncJob.acceptedCount = acceptedCount;
    syncJob.rejectedCount = rejectedCount;
    syncJob.processedAt = new Date();
    syncJob.failedEntries = failedEntries;
    syncJob.status =
      acceptedCount > 0 ? PosSyncStatus.PROCESSED : PosSyncStatus.FAILED;

    await this.posSyncJobsRepository.save(syncJob);
    return this.findOneById(syncJob.id);
  }

  async updateStatus(
    id: number,
    dto: UpdatePosSyncJobStatusDto,
  ): Promise<PosSyncJob> {
    const syncJob = await this.findOneById(id);

    if (dto.branchId != null && syncJob.branchId !== dto.branchId) {
      throw new BadRequestException(
        `POS sync job ${id} does not belong to branch ${dto.branchId}`,
      );
    }

    const nextStatus = dto.status;

    if (syncJob.status === nextStatus) {
      return syncJob;
    }

    const allowedTransitions = POS_SYNC_TRANSITIONS[syncJob.status] ?? [];
    if (!allowedTransitions.includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid POS sync transition from ${syncJob.status} to ${nextStatus}`,
      );
    }

    syncJob.status = nextStatus;
    if (nextStatus === PosSyncStatus.RECEIVED) {
      syncJob.processedAt = null;
      syncJob.acceptedCount = 0;
      syncJob.rejectedCount = 0;
      syncJob.failedEntries = [];
    } else {
      syncJob.acceptedCount = dto.acceptedCount ?? syncJob.acceptedCount;
      syncJob.rejectedCount = dto.rejectedCount ?? syncJob.rejectedCount;
      syncJob.processedAt = dto.processedAt
        ? new Date(dto.processedAt)
        : new Date();
    }

    await this.posSyncJobsRepository.save(syncJob);
    return this.findOneById(id);
  }

  async findById(id: number): Promise<PosSyncJob> {
    return this.findOneById(id);
  }

  async listTransferConfirmations(
    id: number,
    branchId: number,
    partnerCredentialId?: number | null,
  ): Promise<PosSyncTransferConfirmationResponseDto[]> {
    const syncJob = await this.findOneById(id);

    if (syncJob.branchId !== branchId) {
      throw new BadRequestException(
        `POS sync job ${id} does not belong to branch ${branchId}`,
      );
    }

    if (
      partnerCredentialId != null &&
      syncJob.partnerCredentialId !== partnerCredentialId
    ) {
      throw new BadRequestException(
        `POS sync job ${id} does not belong to partner credential ${partnerCredentialId}`,
      );
    }

    const transfers = await this.branchTransfersService.findBySource(
      'POS_SYNC',
      id,
      branchId,
    );

    return transfers.map((transfer) => ({
      entryIndex: transfer.sourceEntryIndex ?? null,
      transferId: transfer.id,
      transferNumber: transfer.transferNumber,
      status: transfer.status,
      fromBranchId: transfer.fromBranchId,
      toBranchId: transfer.toBranchId,
      productIds: (transfer.items ?? []).map((item) => item.productId),
      createdAt: transfer.createdAt,
    }));
  }

  async replayFailedEntries(
    id: number,
    dto: ReplayPosSyncFailuresDto,
    actor: {
      id?: number | null;
      email?: string | null;
      roles?: string[];
    } = {},
    partnerCredentialId?: number | null,
  ): Promise<PosSyncJob> {
    const syncJob = await this.findOneById(id);

    if (syncJob.branchId !== dto.branchId) {
      throw new BadRequestException(
        `POS sync job ${id} does not belong to branch ${dto.branchId}`,
      );
    }

    if (
      partnerCredentialId != null &&
      syncJob.partnerCredentialId !== partnerCredentialId
    ) {
      throw new BadRequestException(
        `POS sync job ${id} does not belong to partner credential ${partnerCredentialId}`,
      );
    }

    if (!syncJob.failedEntries?.length) {
      throw new BadRequestException(
        `POS sync job ${id} has no failed entries to replay`,
      );
    }

    const failedEntriesToReplay = dto.entryIndexes?.length
      ? syncJob.failedEntries.filter((entry) =>
          dto.entryIndexes?.includes(entry.entryIndex),
        )
      : syncJob.failedEntries;

    if (!failedEntriesToReplay.length) {
      throw new BadRequestException(
        `No failed entries matched the requested replay selection for POS sync job ${id}`,
      );
    }

    const replayDto: IngestPosSyncDto = {
      branchId: syncJob.branchId ?? dto.branchId,
      partnerCredentialId:
        partnerCredentialId ?? syncJob.partnerCredentialId ?? undefined,
      syncType: syncJob.syncType,
      externalJobId: this.buildReplayExternalJobId(syncJob),
      entries: failedEntriesToReplay.map((entry) => ({
        productId: entry.productId ?? undefined,
        aliasType: entry.aliasType as any,
        aliasValue: entry.aliasValue ?? undefined,
        quantity: entry.quantity,
        movementType: entry.movementType as any,
        counterpartyBranchId: entry.counterpartyBranchId ?? undefined,
        transferId: entry.transferId ?? undefined,
        note: entry.note ?? undefined,
      })),
    };

    return this.ingest(replayDto, actor);
  }

  private async findOneById(id: number): Promise<PosSyncJob> {
    const syncJob = await this.posSyncJobsRepository.findOne({
      where: { id },
      relations: { branch: true, partnerCredential: true },
    });

    if (!syncJob) {
      throw new NotFoundException(`POS sync job with ID ${id} not found`);
    }

    return syncJob;
  }

  private async processInventoryEntry(
    syncJob: PosSyncJob,
    dto: IngestPosSyncDto,
    entry: PosSyncEntryDto,
    entryIndex: number,
    actorUserId?: number | null,
  ): Promise<void> {
    const productId = await this.resolveProductId(dto, entry);

    if (dto.syncType === 'STOCK_SNAPSHOT') {
      const currentOnHand = await this.inventoryLedgerService.getOnHand(
        dto.branchId,
        productId,
      );
      const delta = entry.quantity - currentOnHand;
      if (delta !== 0) {
        await this.inventoryLedgerService.recordMovement({
          branchId: dto.branchId,
          productId,
          movementType: StockMovementType.ADJUSTMENT,
          quantityDelta: delta,
          sourceType: 'POS_SYNC',
          sourceReferenceId: syncJob.id,
          actorUserId,
          note: entry.note ?? 'POS stock snapshot reconciliation',
        });
      }
      return;
    }

    if (dto.syncType === 'SALES_SUMMARY') {
      await this.inventoryLedgerService.recordMovement({
        branchId: dto.branchId,
        productId,
        movementType: StockMovementType.SALE,
        quantityDelta: -Math.abs(entry.quantity),
        sourceType: 'POS_SYNC',
        sourceReferenceId: syncJob.id,
        actorUserId,
        note: entry.note ?? 'POS sales summary',
      });
      return;
    }

    if (!entry.movementType) {
      throw new BadRequestException(
        'movementType is required for STOCK_DELTA sync entries',
      );
    }

    if (entry.movementType === StockMovementType.TRANSFER) {
      if (!entry.counterpartyBranchId) {
        throw new BadRequestException(
          'counterpartyBranchId is required for transfer sync entries',
        );
      }

      const quantity = Math.abs(entry.quantity);
      if (entry.quantity < 0) {
        const transfer = await this.branchTransfersService.create(
          {
            fromBranchId: dto.branchId,
            toBranchId: entry.counterpartyBranchId,
            note: entry.note ?? 'POS transfer out',
            items: [
              {
                productId,
                quantity,
                note: entry.note,
              },
            ],
          },
          { id: actorUserId ?? null },
          {
            sourceType: 'POS_SYNC',
            sourceReferenceId: syncJob.id,
            sourceEntryIndex: entryIndex,
          },
        );
        await this.branchTransfersService.dispatch(
          transfer.id,
          { id: actorUserId ?? null },
          entry.note ?? 'POS transfer out',
        );
        return;
      }

      if (!entry.transferId) {
        throw new BadRequestException(
          'transferId is required for inbound transfer sync entries',
        );
      }

      const transfer = await this.branchTransfersService.findOne(
        entry.transferId,
      );

      if (transfer.toBranchId !== dto.branchId) {
        throw new BadRequestException(
          `Branch transfer ${entry.transferId} is not addressed to branch ${dto.branchId}`,
        );
      }

      if (transfer.fromBranchId !== entry.counterpartyBranchId) {
        throw new BadRequestException(
          `Branch transfer ${entry.transferId} is not sourced from branch ${entry.counterpartyBranchId}`,
        );
      }

      const matchingItem = transfer.items.find(
        (item) => item.productId === productId,
      );

      if (!matchingItem || matchingItem.quantity !== quantity) {
        throw new BadRequestException(
          `Branch transfer ${entry.transferId} does not contain ${quantity} units of product ${productId}`,
        );
      }

      await this.branchTransfersService.receive(
        transfer.id,
        { id: actorUserId ?? null },
        entry.note ?? 'POS transfer in',
      );
      return;
    }

    if (entry.movementType === StockMovementType.SALE) {
      await this.inventoryLedgerService.recordMovement({
        branchId: dto.branchId,
        productId,
        movementType: StockMovementType.SALE,
        quantityDelta: -Math.abs(entry.quantity),
        sourceType: 'POS_SYNC',
        sourceReferenceId: syncJob.id,
        actorUserId,
        note: entry.note ?? 'POS sale delta',
      });
      return;
    }

    await this.inventoryLedgerService.recordMovement({
      branchId: dto.branchId,
      productId,
      movementType: StockMovementType.ADJUSTMENT,
      quantityDelta: entry.quantity,
      sourceType: 'POS_SYNC',
      sourceReferenceId: syncJob.id,
      actorUserId,
      note: entry.note ?? 'POS stock delta adjustment',
    });
  }

  private async findExistingJobForIdempotency(
    dto: IngestPosSyncDto,
  ): Promise<PosSyncJob | null> {
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (idempotencyKey) {
      return this.posSyncJobsRepository.findOne({
        where:
          dto.partnerCredentialId != null
            ? {
                partnerCredentialId: dto.partnerCredentialId,
                idempotencyKey,
                syncType: dto.syncType,
              }
            : {
                branchId: dto.branchId,
                idempotencyKey,
                syncType: dto.syncType,
              },
      });
    }

    const externalJobId = dto.externalJobId?.trim();
    if (externalJobId) {
      return this.posSyncJobsRepository.findOne({
        where:
          dto.partnerCredentialId != null
            ? {
                partnerCredentialId: dto.partnerCredentialId,
                externalJobId,
                syncType: dto.syncType,
              }
            : {
                branchId: dto.branchId,
                externalJobId,
                syncType: dto.syncType,
              },
      });
    }

    return null;
  }

  private toFailedEntry(
    entryIndex: number,
    entry: PosSyncEntryDto,
    error: unknown,
  ): PosSyncFailedEntry {
    return {
      entryIndex,
      productId: entry.productId ?? null,
      aliasType: entry.aliasType ?? null,
      aliasValue: entry.aliasValue ?? null,
      quantity: entry.quantity,
      movementType: entry.movementType ?? null,
      counterpartyBranchId: entry.counterpartyBranchId ?? null,
      transferId: entry.transferId ?? null,
      note: entry.note ?? null,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown POS sync ingestion error',
    };
  }

  private async resolveProductId(
    dto: IngestPosSyncDto,
    entry: PosSyncEntryDto,
  ): Promise<number> {
    if (entry.productId != null) {
      return entry.productId;
    }

    if (!entry.aliasType || !entry.aliasValue?.trim()) {
      throw new BadRequestException(
        'productId or aliasType plus aliasValue is required for POS sync entries',
      );
    }

    const resolvedProductId =
      await this.productAliasesService.resolveProductIdForBranch(
        dto.branchId,
        dto.partnerCredentialId ?? null,
        entry.aliasType,
        entry.aliasValue,
      );

    if (resolvedProductId == null) {
      throw new BadRequestException(
        `No product alias matched ${entry.aliasType}:${entry.aliasValue}`,
      );
    }

    return resolvedProductId;
  }

  private buildReplayExternalJobId(syncJob: PosSyncJob): string {
    const baseJobId = syncJob.externalJobId?.trim() || `job-${syncJob.id}`;
    const replaySuffix = `replay-${Date.now()}`;
    return `${baseJobId}:${replaySuffix}`.slice(0, 255);
  }
}
