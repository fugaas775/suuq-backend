import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { UsersService } from '../users/users.service';
import { FindUsersQueryDto } from '../users/dto/find-users-query.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { ExtendSubscriptionDto } from '../users/dto/subscription-actions.dto';
import { SubscriptionAnalyticsService } from '../metrics/subscription-analytics.service';
import { AdminUsersPageQueryDto } from './dto/admin-users-page-query.dto';
import { AdminSubscriptionRequestsQueryDto } from './dto/admin-subscription-requests-query.dto';
import { AdminUserListQueryDto } from './dto/admin-user-list-query.dto';
import { BranchStaffService } from '../branch-staff/branch-staff.service';
import { SellerWorkspaceService } from '../seller-workspace/seller-workspace.service';

const POS_ROLES = new Set([UserRole.POS_MANAGER, UserRole.POS_OPERATOR]);
const SELLER_ROLES = new Set([
  UserRole.VENDOR,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
]);

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly subscriptionAnalytics: SubscriptionAnalyticsService,
    private readonly branchStaffService: BranchStaffService,
    private readonly sellerWorkspaceService: SellerWorkspaceService,
  ) {}

  @Get('subscription/analytics')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getSubscriptionAnalytics() {
    return this.subscriptionAnalytics.getAnalytics();
  }

  @Get('subscription/active')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getActiveSubscriptions(@Query() query: AdminUsersPageQueryDto) {
    return this.usersService.findActiveProUsers(
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('subscription/requests')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listSubscriptionRequests(
    @Query() query: AdminSubscriptionRequestsQueryDto,
  ) {
    return this.usersService.findAllSubscriptionRequests(
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
    );
  }

  @Post('subscription/:userId/extend')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async extendSubscription(
    @Param('userId') userId: number,
    @Body() dto: ExtendSubscriptionDto,
  ) {
    return this.usersService.extendSubscription(userId, dto.days, dto.reason);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async list(@Query() filters: AdminUserListQueryDto) {
    const pageSize = filters.pageSize || filters.limit || 20;
    const {
      users,
      total,
      page,
      pageSize: effectivePageSize,
    } = await this.usersService.findAll({
      ...filters,
      page: filters.page || 1,
      pageSize,
    });

    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        const roles = Array.isArray(user.roles) ? user.roles : [];
        const enrichedUser: Record<string, unknown> = { ...user };

        if (roles.some((role) => POS_ROLES.has(role))) {
          const posAccess =
            await this.branchStaffService.getAdminPosAccessForUser(user.id);

          enrichedUser.posBranchAssignments = posAccess.branchAssignments;
          enrichedUser.posWorkspaceActivationCandidates =
            posAccess.workspaceActivationCandidates;
        }

        if (roles.some((role) => SELLER_ROLES.has(role))) {
          enrichedUser.sellerWorkspaceSummary =
            await this.safeGetSellerWorkspaceSummary(user.id);
        }

        return enrichedUser;
      }),
    );

    const data = enrichedUsers.map((user) =>
      plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    );

    if (filters.meta === '1') {
      return { data, meta: { total, page, pageSize: effectivePageSize } };
    }

    return data;
  }

  private async safeGetSellerWorkspaceSummary(userId: number) {
    try {
      const overview = await this.sellerWorkspaceService.getOverview(userId);
      return {
        windowHours: overview.windowHours,
        storeCount: overview.storeCount,
        branchCount: overview.branchCount,
        orderCount: overview.orderCount,
        grossSales: overview.grossSales,
        purchaseOrderCount: overview.purchaseOrderCount,
        openPurchaseOrderCount: overview.openPurchaseOrderCount,
        checkoutCount: overview.checkoutCount,
        failedCheckoutCount: overview.failedCheckoutCount,
        syncJobCount: overview.syncJobCount,
        failedSyncJobCount: overview.failedSyncJobCount,
        catalogProductCount: overview.catalogProductCount,
        registerSessionCount: overview.registerSessionCount,
        currentPlanCode: overview.currentPlanCode,
        recommendedPlanCode: overview.recommendedPlanCode,
        billingStatus: overview.workspace.billingStatus,
        status: overview.workspace.status,
      };
    } catch {
      return null;
    }
  }
}
