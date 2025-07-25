import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminStatsDto } from './dto/admin-stats.dto';
import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import { RolesGuard } from '../auth/roles.guard';
import { AuthGuard } from '@nestjs/passport';
import { WithdrawalsService } from '../withdrawals/withdrawals.service';
import { WithdrawalStatus } from '../withdrawals/entities/withdrawal.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { CreateAdminDto } from './dto/create-admin.dto';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly ordersService: OrdersService,
    private readonly withdrawalsService: WithdrawalsService,
  ) {}

  // ================== USER MANAGEMENT ENDPOINTS ==================

  /**
   * GET /api/admin/users
   * Retrieve all users with pagination and optional role filtering
   */
  @Get('users')
  async getAllUsers(
    @Query('role') role?: string, 
    @Query('page') page = 1, 
    @Query('pageSize') pageSize = 20
  ) {
    const userRole = role ? (UserRole[role as keyof typeof UserRole]) : undefined;
    return this.usersService.findAll({ 
      role: userRole, 
      page: Number(page), 
      pageSize: Number(pageSize) 
    });
  }

  /**
   * GET /api/admin/users/:id
   * Retrieve a specific user by ID
   */
  @Get('users/:id')
  async getUser(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findById(id);
  }

  /**
   * PATCH /api/admin/users/:id
   * Update user information
   */
  @Patch('users/:id')
  async updateUser(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateUserDto) {
    return this.usersService.update(id, data);
  }

  /**
   * POST /api/admin/users
   * Create a new ADMIN user (SUPER_ADMIN only)
   */
  @Post('users')
  @Roles(UserRole.SUPER_ADMIN)
  async createAdminUser(@Body() dto: CreateAdminDto) {
    return this.usersService.create({
      ...dto,
      roles: [UserRole.ADMIN],
    });
  }

  /**
   * PATCH /api/admin/users/:id/roles
   * Update user roles (SUPER_ADMIN only)
   */
  @Patch('users/:id/roles')
  @Roles(UserRole.SUPER_ADMIN)
  async updateUserRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserRolesDto
  ) {
    return this.usersService.updateUserRoles(id, dto.roles);
  }

  /**
   * PATCH /api/admin/users/:id/deactivate
   * Deactivate a user account
   */
  @Patch('users/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivateUser(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.deactivateUser(id);
  }

  // ================== ORDER MANAGEMENT ENDPOINTS ==================

  /**
   * GET /api/admin/orders
   * Retrieve all orders with filtering and pagination
   */
  @Get('orders')
  async getAllOrders(@Query() query: any) {
    return this.ordersService.findAllForAdmin(query);
  }

  /**
   * PATCH /api/admin/orders/:id/cancel
   * Cancel an order as admin
   */
  @Patch('orders/:id/cancel')
  async cancelOrder(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.cancelOrderForAdmin(id);
  }

  // ================== PLATFORM STATS ENDPOINT ==================

  /**
   * GET /api/admin/stats
   * Get platform statistics and analytics
   */
  @Get('stats')
  async getStats(): Promise<AdminStatsDto> {
    return {
      totalUsers: await this.usersService.countAll(),
      totalVendors: await this.usersService.countByRole(UserRole.VENDOR),
      totalCustomers: await this.usersService.countByRole(UserRole.CUSTOMER),
      totalAdmins: await this.usersService.countByRole(UserRole.ADMIN),
      totalRevenue: await this.ordersService.getTotalRevenue(),
      totalOrders: await this.ordersService.countAll(),
      pendingWithdrawals: await this.withdrawalsService.countPendingWithdrawals(),
    };
  }

  // ================== WITHDRAWAL MANAGEMENT ENDPOINTS ==================

  /**
   * GET /api/admin/withdrawals
   * List all withdrawal requests with optional status filtering
   */
  @Get('withdrawals')
  async getAllWithdrawals(@Query('status') status?: string) {
    let withdrawalStatus;
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status.toUpperCase())) {
      withdrawalStatus = status.toUpperCase() as WithdrawalStatus;
    }
    return this.withdrawalsService.getAllWithdrawals(withdrawalStatus);
  }

  /**
   * PATCH /api/admin/withdrawals/:id/approve
   * Approve a withdrawal request
   */
  @Patch('withdrawals/:id/approve')
  async approveWithdrawal(@Param('id', ParseIntPipe) id: number) {
    return this.withdrawalsService.approveWithdrawal(id);
  }

  /**
   * PATCH /api/admin/withdrawals/:id/reject
   * Reject a withdrawal request
   */
  @Patch('withdrawals/:id/reject')
  async rejectWithdrawal(@Param('id', ParseIntPipe) id: number) {
    return this.withdrawalsService.rejectWithdrawal(id);
  }
}
