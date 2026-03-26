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

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly subscriptionAnalytics: SubscriptionAnalyticsService,
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

    const data = users.map((user) =>
      plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    );

    if (filters.meta === '1') {
      return { data, meta: { total, page, pageSize: effectivePageSize } };
    }

    return data;
  }
}
