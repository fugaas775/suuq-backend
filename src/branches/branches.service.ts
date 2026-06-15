import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, Repository } from 'typeorm';
import { Branch } from './entities/branch.entity';
import { CreateBranchDto } from './dto/create-branch.dto';
import { VendorStore } from '../vendor/entities/vendor-store.entity';

export interface AdminListBranchesQuery {
  search?: string;
  serviceFormat?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(VendorStore)
    private readonly vendorStoresRepository: Repository<VendorStore>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateBranchDto): Promise<Branch> {
    const branch = this.branchesRepository.create(dto);
    return this.branchesRepository.save(branch);
  }

  async findAll(): Promise<Branch[]> {
    return this.branchesRepository.find({
      order: { createdAt: 'DESC' },
      relations: { owner: true },
    });
  }

  async adminListBranches(query: AdminListBranchesQuery = {}) {
    const { search, serviceFormat, isActive, page = 1, limit = 25 } = query;
    const where: Record<string, unknown> = {};

    if (search) {
      where.name = ILike(`%${search}%`);
    }
    if (serviceFormat) {
      where.serviceFormat = serviceFormat;
    }
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [items, total] = await this.branchesRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      relations: { owner: true, retailTenant: true },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Count active/inactive scoped to same search+serviceFormat filters (ignoring isActive filter)
    const countWhere = { ...where } as Record<string, unknown>;
    delete countWhere.isActive;
    const [activeCount, inactiveCount] = await Promise.all([
      this.branchesRepository.count({
        where: { ...countWhere, isActive: true },
      }),
      this.branchesRepository.count({
        where: { ...countWhere, isActive: false },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      activeCount,
      inactiveCount,
    };
  }

  async patchAdminBranch(
    id: number,
    patch: { isActive?: boolean },
  ): Promise<Branch> {
    const branch = await this.branchesRepository.findOne({
      where: { id },
      relations: { owner: true, retailTenant: true },
    });
    if (!branch) throw new NotFoundException(`Branch #${id} not found`);
    if (patch.isActive !== undefined) {
      branch.isActive = patch.isActive;
      // Mirror activation state to the linked VendorStore so the store
      // appears/disappears from consumer listings accordingly.
      if (branch.vendorStoreId) {
        await this.vendorStoresRepository.update(
          { id: branch.vendorStoreId },
          { isConsumerVisible: patch.isActive },
        );
      }
    }
    return this.branchesRepository.save(branch);
  }

  /**
   * Sync VendorStore name and serviceFormat whenever a branch is renamed or its
   * serviceFormat changes. Called by seller-workspace.service after saving a branch.
   */
  async syncVendorStore(
    branchId: number,
    patch: { storeName?: string; serviceFormat?: string | null },
  ): Promise<void> {
    const store = await this.vendorStoresRepository.findOne({
      where: { branchId },
    });
    if (!store) return;
    const update: Partial<VendorStore> = {};
    if (patch.storeName !== undefined) update.storeName = patch.storeName;
    if (patch.serviceFormat !== undefined)
      update.serviceFormat = patch.serviceFormat;
    if (Object.keys(update).length) {
      await this.vendorStoresRepository.update({ id: store.id }, update);
    }
  }

  /**
   * Count OUTSTANDING equity BNPL activations pinned to the given branches.
   * Deleting such a branch would leave the obligation as a ghost row, so it is
   * blocked unless the caller opts into manual settlement. Returns a per-branch
   * breakdown so the caller can build a clear error.
   */
  private async findOutstandingObligations(
    ids: number[],
  ): Promise<Array<{ branchId: number; count: number }>> {
    if (!ids.length) return [];
    const rows = await this.dataSource.query(
      `SELECT "branchId" AS "branchId", COUNT(*)::int AS count
         FROM equity_partner_bnpl_activations
        WHERE status = 'OUTSTANDING' AND "branchId" = ANY($1)
        GROUP BY "branchId"`,
      [ids],
    );
    return rows.map((r: { branchId: number; count: number }) => ({
      branchId: Number(r.branchId),
      count: Number(r.count),
    }));
  }

  /**
   * Write off (FORGIVEN) every OUTSTANDING activation + credit-ledger entry
   * pinned to a branch — the admin override behind "settle & delete". No money
   * is collected here, so the obligation is marked FORGIVEN (a write-off), NOT
   * SETTLED (paid): marking it SETTLED would inflate collected revenue and hide
   * an uncollected debt in reporting. Must run before the branch row is removed:
   * the FK nulls `branchId` on delete, after which these WHERE clauses would no
   * longer match.
   */
  private async writeOffBranchObligations(
    manager: EntityManager,
    branchId: number,
  ): Promise<void> {
    const reference = `MANUAL-WRITEOFF-${branchId}-${Date.now()}`;
    await manager.query(
      `UPDATE equity_partner_bnpl_activations
          SET status = 'FORGIVEN',
              "settledAt" = now(),
              "settlementReferenceId" = COALESCE("settlementReferenceId", $2),
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'manualWriteOff',
                jsonb_build_object('by', 'admin', 'at', now()::text, 'reason', 'branch-delete')
              )
        WHERE "branchId" = $1 AND status = 'OUTSTANDING'`,
      [branchId, reference],
    );
    await manager.query(
      `UPDATE equity_partner_bnpl_credit_ledger
          SET "activationStatus" = 'FORGIVEN',
              "settlementReferenceId" = COALESCE("settlementReferenceId", $2)
        WHERE "branchId" = $1 AND "activationStatus" = 'OUTSTANDING'`,
      [branchId, reference],
    );
  }

  async deleteAdminBranch(
    id: number,
    opts: { settleOutstanding?: boolean } = {},
  ): Promise<void> {
    const branch = await this.branchesRepository.findOne({ where: { id } });
    if (!branch) throw new NotFoundException(`Branch #${id} not found`);

    const total = (await this.findOutstandingObligations([id])).reduce(
      (sum, o) => sum + o.count,
      0,
    );
    if (total > 0 && !opts.settleOutstanding) {
      throw new BadRequestException(
        `Branch #${id} has ${total} outstanding BNPL activation(s). ` +
          `Settle or cancel them first, or delete with manual settlement.`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      if (opts.settleOutstanding && total > 0) {
        await this.writeOffBranchObligations(manager, id);
      }
      // DB-level ON DELETE CASCADE / SET NULL handles all dependents.
      await manager.delete(Branch, id);
    });
  }

  async bulkDeleteAdminBranches(
    ids: number[],
    opts: { settleOutstanding?: boolean } = {},
  ): Promise<number> {
    if (!ids.length) return 0;

    const outstanding = await this.findOutstandingObligations(ids);
    if (outstanding.length && !opts.settleOutstanding) {
      const detail = outstanding
        .map((o) => `#${o.branchId} (${o.count})`)
        .join(', ');
      throw new BadRequestException(
        `Cannot delete: branch(es) ${detail} have outstanding BNPL activation(s). ` +
          `Settle or cancel them first, or delete with manual settlement.`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      if (opts.settleOutstanding) {
        for (const o of outstanding) {
          await this.writeOffBranchObligations(manager, o.branchId);
        }
      }
      const result = await manager.delete(Branch, ids);
      return typeof result.affected === 'number' ? result.affected : ids.length;
    });
  }
}
