import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { UsersService } from '../users/users.service';
import { FindUsersQueryDto } from '../users/dto/find-users-query.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { SubscriptionRequestStatus } from '../users/entities/subscription-request.entity';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('subscription/requests')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listSubscriptionRequests(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status?: SubscriptionRequestStatus,
  ) {
    return this.usersService.findAllSubscriptionRequests(page, limit, status);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async list(
    @Query() filters: FindUsersQueryDto,
    @Query('meta') metaFlag?: string,
  ) {
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

    if (metaFlag === '1') {
      return { data, meta: { total, page, pageSize: effectivePageSize } };
    }

    return data;
  }
}
