import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { PosUserFitCategory } from '../categories/entities/category.entity';
import { RetailEntitlementsService } from '../retail/retail-entitlements.service';
import { RetailModule } from '../retail/entities/tenant-module-entitlement.entity';
import {
  assertAllowedSelfServeServiceFormat,
  buildSelfServeServiceFormatMetadata,
  getDefaultAllowedSelfServeServiceFormats,
} from '../retail/self-serve-service-format.policy';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../auth/roles.enum';
import { BranchStaffService } from './branch-staff.service';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from './entities/branch-staff-assignment.entity';
import {
  CreatePosWorkspaceDto,
  CreatePosWorkspaceResponseDto,
} from './dto/create-pos-workspace.dto';
import { SellerWorkspace } from '../seller-workspace/entities/seller-workspace.entity';

@Injectable()
export class PosPortalOnboardingService {
  private readonly logger = new Logger(PosPortalOnboardingService.name);

  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly assignmentsRepository: Repository<BranchStaffAssignment>,
    @InjectRepository(SellerWorkspace)
    private readonly sellerWorkspacesRepository: Repository<SellerWorkspace>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly retailEntitlementsService: RetailEntitlementsService,
    private readonly branchStaffService: BranchStaffService,
  ) {}

  async createWorkspaceForUser(
    user: User,
    dto: CreatePosWorkspaceDto,
  ): Promise<CreatePosWorkspaceResponseDto> {
    const [existingBranches, activationCandidates] = await Promise.all([
      this.branchStaffService.getPosBranchSummariesForUser({
        id: user.id,
        roles: user.roles,
      }),
      this.branchStaffService.getPosWorkspaceActivationCandidatesForUser({
        id: user.id,
        roles: user.roles,
      }),
    ]);

    if (existingBranches.length || activationCandidates.length) {
      throw new BadRequestException(
        'This account already has a POS workspace or a pending workspace activation.',
      );
    }

    const serviceFormat = assertAllowedSelfServeServiceFormat(
      dto.serviceFormat,
      'POS self-serve onboarding',
      getDefaultAllowedSelfServeServiceFormats(),
    );
    const categoryId = Number.isFinite(Number(dto.categoryId))
      ? Number(dto.categoryId)
      : null;

    const tenant = await this.retailEntitlementsService.createTenant({
      name: dto.businessName.trim(),
      billingEmail: user.email,
      defaultCurrency: dto.defaultCurrency?.trim() || 'ETB',
      ownerUserId: user.id,
    });

    const branch = await this.branchesRepository.save(
      this.branchesRepository.create({
        name: dto.branchName.trim(),
        ownerId: user.id,
        retailTenantId: tenant.id,
        serviceFormat,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        country: dto.country?.trim() || null,
        phone: dto.phone?.trim() || null,
        isActive: true,
      }),
    );

    await this.assignmentsRepository.save(
      this.assignmentsRepository.create({
        branchId: branch.id,
        userId: user.id,
        role: BranchStaffRole.MANAGER,
        permissions: [],
        isActive: true,
      }),
    );

    // Ensure user.roles includes POS_MANAGER so admin dashboards can detect
    // their POS trial/subscription status via sellerWorkspaceSummary.
    if (!user.roles.includes(UserRole.POS_MANAGER)) {
      await this.usersRepository.update(user.id, {
        roles: [...user.roles, UserRole.POS_MANAGER],
      });
    }

    await Promise.all([
      this.retailEntitlementsService.upsertModuleEntitlement(
        tenant.id,
        RetailModule.POS_CORE,
        {
          enabled: true,
          reason: 'Enabled during POS-S self-serve onboarding',
          metadata: buildSelfServeServiceFormatMetadata(),
        },
      ),
      this.retailEntitlementsService.upsertModuleEntitlement(
        tenant.id,
        RetailModule.INVENTORY_CORE,
        {
          enabled: true,
          reason: 'Enabled during POS-S self-serve onboarding',
        },
      ),
    ]);

    const userFit = dto.userFit ?? null;
    const updatedTenant =
      categoryId || userFit
        ? await this.retailEntitlementsService.updateOnboardingProfile(
            tenant.id,
            {
              categoryId,
              userFit,
              notes: null,
            },
            {
              id: user.id,
              email: user.email,
            },
          )
        : null;

    const createdCandidates =
      await this.branchStaffService.getPosWorkspaceActivationCandidatesForUser({
        id: user.id,
        roles: user.roles,
      });
    const createdWorkspace = createdCandidates.find(
      (candidate) => candidate.branchId === branch.id,
    );

    // Link SellerWorkspace.primaryRetailTenantId so the vendor and POS tenant
    // are unified from the moment the workspace is created.
    void this.linkSellerWorkspaceTenant(user.id, tenant.id);

    return {
      onboardingState: 'BRANCH_WORKSPACE_ACTIVATION_REQUIRED',
      message:
        'Your POS-S workspace was created. Complete billing activation to open it.',
      workspace: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        branchId: branch.id,
        branchName: branch.name,
        branchCode: branch.code ?? null,
        workspaceStatus:
          createdWorkspace?.workspaceStatus ?? 'PAYMENT_REQUIRED',
      },
      pricing: this.branchStaffService.getPosWorkspacePricing(),
      activationCandidates: createdCandidates,
      onboardingProfile: updatedTenant?.onboardingProfile ?? null,
    };
  }

  private async linkSellerWorkspaceTenant(
    ownerUserId: number,
    retailTenantId: number,
  ): Promise<void> {
    try {
      let workspace = await this.sellerWorkspacesRepository.findOne({
        where: { ownerUserId },
      });
      if (!workspace) {
        workspace = this.sellerWorkspacesRepository.create({ ownerUserId });
      }
      if (workspace.primaryRetailTenantId == null) {
        workspace.primaryRetailTenantId = retailTenantId;
        await this.sellerWorkspacesRepository.save(workspace);
        this.logger.log(
          `Linked SellerWorkspace for user #${ownerUserId} to tenant #${retailTenantId}`,
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to link SellerWorkspace for user #${ownerUserId}: ${err?.message}`,
      );
    }
  }
}
