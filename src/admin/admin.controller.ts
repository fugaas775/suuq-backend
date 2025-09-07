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
  Put,
  BadRequestException,
  Delete,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import { RolesGuard } from '../auth/roles.guard';
import { AuthGuard } from '@nestjs/passport'; // Import the built-in guard
import { WithdrawalsService } from '../withdrawals/withdrawals.service';
import { WithdrawalStatus } from '../withdrawals/entities/withdrawal.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { CreateAdminDto } from './dto/create-admin.dto';
import { BulkUserIdsDto } from './dto/bulk-user-ids.dto';

// ✨ FINAL FIX: Use AuthGuard('jwt') to match your other working controllers
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
  @Get('users')
  async getAllUsers(
    @Query('role') role?: string,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
  ) {
    const userRole = role ? UserRole[role as keyof typeof UserRole] : undefined;
    return this.usersService.findAll({
      role: userRole,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  }

  @Get('users/:id')
  async getUser(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findById(id);
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateUserDto,
  ) {
    return this.usersService.update(id, data);
  }

  @Post('users')
  @Roles(UserRole.SUPER_ADMIN)
  async createAdminUser(@Body() dto: CreateAdminDto) {
    return this.usersService.create({
      ...dto,
      roles: [UserRole.ADMIN],
    });
  }

  @Patch('users/:id/roles')
  @Roles(UserRole.SUPER_ADMIN)
  async updateUserRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserRolesDto,
  ) {
    return this.usersService.updateUserRoles(id, dto.roles);
  }

  @Patch('users/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivateUser(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.deactivateUser(id);
  }

  @Delete('users/:id/hard')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async hardDeleteUser(@Param('id', ParseIntPipe) id: number) {
    await this.usersService.remove(id);
  }

  @Patch('users/bulk/deactivate')
  async bulkDeactivateUsers(@Body() dto: BulkUserIdsDto) {
    return this.usersService.deactivateMany(dto.ids);
  }

  @Delete('users/bulk/hard')
  @Roles(UserRole.SUPER_ADMIN)
  async bulkHardDeleteUsers(@Body() dto: BulkUserIdsDto) {
    return this.usersService.hardDeleteMany(dto.ids);
  }

  // ================== ORDER MANAGEMENT ENDPOINTS ==================
  @Get('orders')
  async getAllOrders(
    @Query() query: { page?: number; pageSize?: number; status?: string },
  ) {
    const result = await this.ordersService.findAllForAdmin(query as any);
    return { orders: result.data, total: result.total };
  }

  @Patch('orders/:id/cancel')
  async cancelOrder(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.cancelOrderForAdmin(id);
  }

  // TRUE HARD DELETE (irreversible). Used by Admin UI when configured for hard delete.
  @Delete('orders/:id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  async hardDeleteOrder(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.ordersService.hardDelete(id);
  }

  // DELETE /api/admin/orders/:id -> soft-delete by cancelling
  @Delete('orders/:id')
  async removeOrder(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.cancelOrderForAdmin(id);
  }

  @Patch('orders/:id/assign-deliverer')
  async assignDeliverer(
    @Param('id', ParseIntPipe) id: number,
    @Body('delivererId', ParseIntPipe) delivererId: number,
  ) {
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  // ===== Alias routes for frontend compatibility =====
  @Put('orders/:id/assign')
  async assignDelivererPut(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Query() query?: any,
  ) {
    const delivererId = Number(
      body?.delivererId ??
        body?.userId ??
        body?.deliverer_id ??
        body?.assigneeId ??
        body?.driverId ??
        body?.courierId ??
        query?.delivererId ??
        query?.userId,
    );
    if (!delivererId || Number.isNaN(delivererId)) {
      throw new BadRequestException('delivererId is required');
    }
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Patch('orders/:id/assign')
  async assignDelivererAssignPatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Query() query?: any,
  ) {
    const delivererId = Number(
      body?.delivererId ??
        body?.userId ??
        body?.deliverer_id ??
        body?.assigneeId ??
        body?.driverId ??
        body?.courierId ??
        query?.delivererId ??
        query?.userId,
    );
    if (!delivererId || Number.isNaN(delivererId)) {
      throw new BadRequestException('delivererId is required');
    }
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Post('orders/:id/assign')
  async assignDelivererAssignPost(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Query() query?: any,
  ) {
    const delivererId = Number(
      body?.delivererId ??
        body?.userId ??
        body?.deliverer_id ??
        body?.assigneeId ??
        body?.driverId ??
        body?.courierId ??
        query?.delivererId ??
        query?.userId,
    );
    if (!delivererId || Number.isNaN(delivererId)) {
      throw new BadRequestException('delivererId is required');
    }
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Patch('orders/:id/deliverer')
  async assignDelivererPatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Query() query?: any,
  ) {
    const delivererId = Number(
      body?.delivererId ??
        body?.userId ??
        body?.deliverer_id ??
        body?.assigneeId ??
        body?.driverId ??
        body?.courierId ??
        query?.delivererId ??
        query?.userId,
    );
    if (!delivererId || Number.isNaN(delivererId)) {
      throw new BadRequestException('delivererId is required');
    }
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Post('orders/:id/deliverer')
  async assignDelivererPost(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Query() query?: any,
  ) {
    const delivererId = Number(
      body?.delivererId ??
        body?.userId ??
        body?.deliverer_id ??
        body?.assigneeId ??
        body?.driverId ??
        body?.courierId ??
        query?.delivererId ??
        query?.userId,
    );
    if (!delivererId || Number.isNaN(delivererId)) {
      throw new BadRequestException('delivererId is required');
    }
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  // ================== PLATFORM STATS ENDPOINT ==================
  @Get('stats')
  async getStats(): Promise<AdminStatsDto> {
    return {
      totalUsers: await this.usersService.countAll(),
      totalVendors: await this.usersService.countByRole(UserRole.VENDOR),
      totalCustomers: await this.usersService.countByRole(UserRole.CUSTOMER),
      totalAdmins: await this.usersService.countByRole(UserRole.ADMIN),
      totalRevenue: await this.ordersService.getTotalRevenue(),
      totalOrders: await this.ordersService.countAll(),
      pendingWithdrawals:
        await this.withdrawalsService.countPendingWithdrawals(),
    };
  }

  // ================== WITHDRAWAL MANAGEMENT ENDPOINTS ==================
  @Get('withdrawals')
  async getAllWithdrawals(@Query('status') status?: WithdrawalStatus) {
    return this.withdrawalsService.getAllWithdrawals(status);
  }

  @Patch('withdrawals/:id/approve')
  async approveWithdrawal(@Param('id', ParseIntPipe) id: number) {
    return this.withdrawalsService.approveWithdrawal(id);
  }

  @Patch('withdrawals/:id/reject')
  async rejectWithdrawal(@Param('id', ParseIntPipe) id: number) {
    return this.withdrawalsService.rejectWithdrawal(id);
  }
}
