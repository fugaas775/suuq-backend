import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import {
  BranchStaffAssignment,
  BranchStaffRole,
} from '../branch-staff/entities/branch-staff-assignment.entity';
import { RetailModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailTenantStatus } from '../retail/entities/retail-tenant.entity';
import { TenantModuleEntitlement } from '../retail/entities/tenant-module-entitlement.entity';
import {
  TenantSubscription,
  TenantSubscriptionStatus,
} from '../retail/entities/tenant-subscription.entity';
import { isLivePosSelfServeTrial } from '../retail/pos-self-serve-trial.policy';
import { UserRole } from './roles.enum';

@Injectable()
export class EffectiveUserRoleService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async resolveRoles(user: {
    id?: number | null;
    roles?: string[];
  }): Promise<UserRole[]> {
    const roles = Array.from(
      new Set((Array.isArray(user.roles) ? user.roles : []) as UserRole[]),
    );

    if (roles.includes(UserRole.VENDOR)) {
      roles.push(UserRole.POS_MANAGER);
      roles.push(UserRole.ADMIN);
    }

    if (!user?.id) {
      return roles;
    }

    const branchRepository = this.dataSource.getRepository(Branch);
    const assignmentRepository = this.dataSource.getRepository(
      BranchStaffAssignment,
    );
    const entitlementRepository = this.dataSource.getRepository(
      TenantModuleEntitlement,
    );
    const subscriptionRepository =
      this.dataSource.getRepository(TenantSubscription);

    const [ownedBranches, assignments] = await Promise.all([
      branchRepository.find({
        where: { ownerId: user.id, isActive: true },
        select: { id: true, retailTenantId: true },
      }),
      assignmentRepository.find({
        where: { userId: user.id, isActive: true },
        relations: { branch: true },
      }),
    ]);

    const branchAccess = new Map<
      number,
      {
        isOwner: boolean;
        role: BranchStaffRole;
        retailTenantId?: number | null;
      }
    >();

    for (const branch of ownedBranches) {
      branchAccess.set(branch.id, {
        isOwner: true,
        role: BranchStaffRole.MANAGER,
        retailTenantId: branch.retailTenantId ?? null,
      });
    }

    for (const assignment of assignments) {
      if (!assignment.branch?.isActive) {
        continue;
      }

      const existing = branchAccess.get(assignment.branchId);
      branchAccess.set(assignment.branchId, {
        isOwner: existing?.isOwner ?? false,
        role:
          existing?.isOwner || existing?.role === BranchStaffRole.MANAGER
            ? BranchStaffRole.MANAGER
            : (assignment.role ?? BranchStaffRole.OPERATOR),
        retailTenantId:
          existing?.retailTenantId ?? assignment.branch?.retailTenantId ?? null,
      });
    }

    const tenantIds = Array.from(
      new Set(
        Array.from(branchAccess.values())
          .map((entry) => entry.retailTenantId)
          .filter((tenantId): tenantId is number => Number.isInteger(tenantId)),
      ),
    );

    const now = Date.now();
    const activeTenantIds = new Set<number>();
    const posEnabledTenantIds = new Set<number>();

    if (tenantIds.length > 0) {
      const [activeSubscriptions, posEntitlements] = await Promise.all([
        subscriptionRepository.find({
          where: {
            tenantId: In(tenantIds),
            status: In([
              TenantSubscriptionStatus.ACTIVE,
              // TRIAL is read too, not because every TRIAL row opens a
              // workspace, but because the auto-provisioned free period is
              // stored as one. The columns `isLivePosSelfServeTrial` reads have
              // to come back with it.
              TenantSubscriptionStatus.TRIAL,
            ]),
          },
          select: {
            tenantId: true,
            status: true,
            planCode: true,
            endsAt: true,
          },
        }),
        entitlementRepository
          .createQueryBuilder('entitlement')
          .innerJoin('entitlement.tenant', 'tenant')
          .select(['entitlement.tenantId AS "tenantId"'])
          .where('entitlement.tenantId IN (:...tenantIds)', { tenantIds })
          .andWhere('entitlement.module = :module', {
            module: RetailModule.POS_CORE,
          })
          .andWhere('entitlement.enabled = true')
          .andWhere('tenant.status = :tenantStatus', {
            tenantStatus: RetailTenantStatus.ACTIVE,
          })
          .andWhere(
            '(entitlement.startsAt IS NULL OR entitlement.startsAt <= :now)',
            {
              now: new Date(now),
            },
          )
          .andWhere(
            '(entitlement.expiresAt IS NULL OR entitlement.expiresAt >= :now)',
            {
              now: new Date(now),
            },
          )
          .getRawMany<{ tenantId: string | number }>(),
      ]);

      for (const subscription of activeSubscriptions) {
        // A live self-serve trial counts exactly as a paid subscription does.
        //
        // It did not, and the branch staff of every free workspace paid for it.
        // A brand-new signup is provisioned with `status: TRIAL` (see
        // `startPosSelfServeTrial`), so a tenant filtered on ACTIVE alone was
        // never reached by the loop below, and the roles a staff member is owed
        // BY THEIR ASSIGNMENT — POS_MANAGER, POS_OPERATOR — were never granted.
        //
        // The owner never noticed: onboarding stamps POS_MANAGER onto their
        // user row, and a VENDOR gets it unconditionally above. A cashier
        // created by `createManualAccount` starts with `roles: []` and has
        // nothing else to fall back on, so they signed in holding an empty
        // roles array — a session that works everywhere the POS lives under
        // `/pos/v1` (PosBranchAccessGuard reads the assignment, not the role)
        // and 403s on every `@Roles`-guarded `/retail/v1/ops` route. The one
        // that shows is `branch-products`: the till opened, the drawer worked,
        // the shift ran, and the product grid was empty with no way to refresh
        // it into existence.
        //
        // `isLivePosSelfServeTrial` is the same predicate
        // `getBranchWorkspaceStatus` already answers ACTIVE with, so staff
        // access and workspace access now agree on what an open branch is. A
        // LAPSED trial still grants nothing, which is the point of a deadline.
        if (
          subscription.status === TenantSubscriptionStatus.ACTIVE ||
          isLivePosSelfServeTrial(subscription, now)
        ) {
          activeTenantIds.add(subscription.tenantId);
        }
      }

      for (const entitlement of posEntitlements) {
        posEnabledTenantIds.add(Number(entitlement.tenantId));
      }
    }

    let hasManagerAccess = false;
    let hasOperatorAccess = false;

    for (const access of branchAccess.values()) {
      const tenantId = access.retailTenantId;
      if (
        !tenantId ||
        !activeTenantIds.has(tenantId) ||
        !posEnabledTenantIds.has(tenantId)
      ) {
        continue;
      }

      if (access.isOwner || access.role === BranchStaffRole.MANAGER) {
        hasManagerAccess = true;
        continue;
      }

      if (access.role === BranchStaffRole.OPERATOR) {
        hasOperatorAccess = true;
      }
    }

    if (hasManagerAccess) {
      roles.push(UserRole.POS_MANAGER);
    } else if (hasOperatorAccess) {
      roles.push(UserRole.POS_OPERATOR);
    }

    return Array.from(new Set(roles));
  }

  async applyEffectiveRoles<T extends { id?: number | null; roles?: string[] }>(
    user: T,
  ): Promise<T & { roles: UserRole[] }> {
    const roles = await this.resolveRoles(user);
    return {
      ...user,
      roles,
    };
  }
}
