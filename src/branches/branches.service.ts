import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
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
      // Mirror deactivation to the linked VendorStore so the store disappears from consumer listings.
      if (!patch.isActive && branch.vendorStoreId) {
        await this.vendorStoresRepository.update(
          { id: branch.vendorStoreId },
          { isConsumerVisible: false },
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

  async deleteAdminBranch(id: number): Promise<void> {
    const branch = await this.branchesRepository.findOne({ where: { id } });
    if (!branch) throw new NotFoundException(`Branch #${id} not found`);
    await this.branchesRepository.remove(branch);
  }

  async bulkDeleteAdminBranches(ids: number[]): Promise<number> {
    if (!ids.length) return 0;
    const result = await this.branchesRepository.delete(ids);
    return typeof result.affected === 'number' ? result.affected : ids.length;
  }
}
