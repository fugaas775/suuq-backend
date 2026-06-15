import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import {
  SupplierOnboardingStatus,
  SupplierProfile,
} from './entities/supplier-profile.entity';
import { resolveActiveOwnedProfile } from './active-supplier.util';
import { CreateSupplierProfileDto } from './dto/create-supplier-profile.dto';
import { UpdateSupplierProfileDto } from './dto/update-supplier-profile.dto';
import { RejectSupplierProfileDto } from './dto/reject-supplier-profile.dto';

type AdminActor = {
  id?: number | null;
  email?: string | null;
};

export interface AdminSearchSuppliersQuery {
  search?: string;
  status?: SupplierOnboardingStatus;
  page?: number;
  limit?: number;
}

// States a supplier may edit / (re)submit from.
const EDITABLE_STATES: SupplierOnboardingStatus[] = [
  SupplierOnboardingStatus.DRAFT,
  SupplierOnboardingStatus.REJECTED,
];

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(SupplierProfile)
    private readonly profilesRepository: Repository<SupplierProfile>,
    private readonly auditService: AuditService,
  ) {}

  // ---- Self-service (resolved from the authenticated user) -----------------

  async createForUser(
    userId: number | null | undefined,
    dto: CreateSupplierProfileDto,
  ): Promise<SupplierProfile> {
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }
    // Multi-supplier: an account may own several supplier profiles, so creating
    // another is allowed. Each is independent and selectable via the switcher.
    const profile = this.profilesRepository.create({
      userId,
      companyName: dto.companyName,
      legalName: dto.legalName ?? null,
      taxId: dto.taxId ?? null,
      countriesServed: dto.countriesServed ?? [],
      payoutDetails: dto.payoutDetails ?? null,
      onboardingStatus: SupplierOnboardingStatus.DRAFT,
      isActive: true,
    });
    return this.profilesRepository.save(profile);
  }

  async getForUser(
    userId: number | null | undefined,
    activeSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<SupplierProfile> {
    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }
    const profile = await resolveActiveOwnedProfile(
      this.profilesRepository,
      userId,
      activeSupplierId,
      actingRoles,
    );
    if (!profile) {
      throw new NotFoundException(
        'No supplier profile exists for this account',
      );
    }
    return profile;
  }

  async updateForUser(
    userId: number | null | undefined,
    dto: UpdateSupplierProfileDto,
    activeSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<SupplierProfile> {
    const profile = await this.getForUser(
      userId,
      activeSupplierId,
      actingRoles,
    );
    this.assertEditable(profile);

    if (dto.companyName !== undefined) profile.companyName = dto.companyName;
    if (dto.legalName !== undefined) profile.legalName = dto.legalName ?? null;
    if (dto.taxId !== undefined) profile.taxId = dto.taxId ?? null;
    if (dto.countriesServed !== undefined)
      profile.countriesServed = dto.countriesServed ?? [];
    if (dto.payoutDetails !== undefined)
      profile.payoutDetails = dto.payoutDetails ?? null;

    return this.profilesRepository.save(profile);
  }

  async submitForReview(
    userId: number | null | undefined,
    activeSupplierId?: number | null,
    actingRoles?: string[] | null,
  ): Promise<SupplierProfile> {
    const profile = await this.getForUser(
      userId,
      activeSupplierId,
      actingRoles,
    );
    if (!EDITABLE_STATES.includes(profile.onboardingStatus)) {
      throw new BadRequestException(
        'Only a draft or rejected profile can be submitted for review',
      );
    }
    profile.onboardingStatus = SupplierOnboardingStatus.PENDING_REVIEW;
    return this.profilesRepository.save(profile);
  }

  // ---- Admin review --------------------------------------------------------

  async listAll(status?: SupplierOnboardingStatus): Promise<SupplierProfile[]> {
    return this.profilesRepository.find({
      where: status ? { onboardingStatus: status } : undefined,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * SUPER_ADMIN / ADMIN supplier search — the supplier-side mirror of
   * BranchesService.adminListBranches. Powers the Seller Hub "act as owner" bar
   * so the platform operator can locate and enter any supplier account.
   * Matches on companyName (case-insensitive), joins the owner for display.
   */
  async adminSearchSuppliers(query: AdminSearchSuppliersQuery = {}) {
    const { search, status, page = 1, limit = 25 } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.companyName = ILike(`%${search}%`);
    }
    if (status) {
      where.onboardingStatus = status;
    }

    const [profiles, total] = await this.profilesRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      relations: { user: true },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: profiles.map((p) => ({
        id: p.id,
        companyName: p.companyName,
        legalName: p.legalName ?? null,
        ownerId: p.userId,
        ownerEmail: p.user?.email ?? null,
        onboardingStatus: p.onboardingStatus,
        activationStatus: p.activationStatus,
        isActive: p.isActive,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approve(id: number, actor: AdminActor = {}): Promise<SupplierProfile> {
    const profile = await this.findByIdOrThrow(id);
    this.assertPendingReview(profile);
    profile.onboardingStatus = SupplierOnboardingStatus.APPROVED;
    const saved = await this.profilesRepository.save(profile);
    await this.auditService.log({
      action: 'supplier_profile.approved',
      targetType: 'SUPPLIER_PROFILE',
      targetId: id,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
    });
    return saved;
  }

  async reject(
    id: number,
    dto: RejectSupplierProfileDto,
    actor: AdminActor = {},
  ): Promise<SupplierProfile> {
    const profile = await this.findByIdOrThrow(id);
    this.assertPendingReview(profile);
    profile.onboardingStatus = SupplierOnboardingStatus.REJECTED;
    const saved = await this.profilesRepository.save(profile);
    await this.auditService.log({
      action: 'supplier_profile.rejected',
      targetType: 'SUPPLIER_PROFILE',
      targetId: id,
      actorId: actor.id ?? null,
      actorEmail: actor.email ?? null,
      reason: dto?.reason ?? null,
    });
    return saved;
  }

  // ---- Helpers -------------------------------------------------------------

  private assertEditable(profile: SupplierProfile): void {
    if (!EDITABLE_STATES.includes(profile.onboardingStatus)) {
      throw new BadRequestException(
        'A supplier profile can only be edited while it is a draft or after rejection',
      );
    }
  }

  private assertPendingReview(profile: SupplierProfile): void {
    if (profile.onboardingStatus !== SupplierOnboardingStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'Only a profile pending review can be approved or rejected',
      );
    }
  }

  private async findByIdOrThrow(id: number): Promise<SupplierProfile> {
    const profile = await this.profilesRepository.findOne({ where: { id } });
    if (!profile) {
      throw new NotFoundException(`Supplier profile ${id} not found`);
    }
    return profile;
  }
}
