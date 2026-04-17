import { BadRequestException, Injectable } from '@nestjs/common';
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
import { BranchStaffService } from './branch-staff.service';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from './entities/branch-staff-assignment.entity';
import {
  CreatePosWorkspaceDto,
  CreatePosWorkspaceResponseDto,
} from './dto/create-pos-workspace.dto';

@Injectable()
export class PosPortalOnboardingService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    @InjectRepository(BranchStaffAssignment)
    private readonly assignmentsRepository: Repository<BranchStaffAssignment>,
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

    return {
      onboardingState: 'BRANCH_WORKSPACE_ACTIVATION_REQUIRED',
      message:
        'Your POS-S workspace was created. Start your 15-day free trial to open it.',
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
}
