import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminStatsDto } from './dto/admin-stats.dto';
import { AssignDelivererDto } from './dto/assign-deliverer.dto';
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
  Header,
  UseInterceptors,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SkipThrottle } from '@nestjs/throttler';
import { OrdersService } from '../orders/orders.service';
import { RolesGuard } from '../auth/roles.guard';
import { AuthGuard } from '@nestjs/passport'; // Import the built-in guard
import { WithdrawalsService } from '../withdrawals/withdrawals.service';
import { WithdrawalStatus } from '../withdrawals/entities/withdrawal.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { CreateAdminDto } from './dto/create-admin.dto';
import { BulkUserIdsDto } from './dto/bulk-user-ids.dto';
import { ClassSerializerInterceptor, ParseEnumPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

// ✨ FINAL FIX: Use AuthGuard('jwt') to match your other working controllers
@UseGuards(AuthGuard('jwt'), RolesGuard)
@UseInterceptors(ClassSerializerInterceptor)
@SkipThrottle()
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
    @Query('role', new ParseEnumPipe(UserRole, { optional: true })) role: UserRole | undefined,
    @Query() { page, pageSize }: PaginationQueryDto,
  ) {
    return this.usersService.findAll({ role, page, pageSize });
  }

  @Get('users/:id')
  async getUser(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findById(id);
    const dto = plainToInstance(AdminUserResponseDto, user, {
      excludeExtraneousValues: true,
    });
    // Ensure documents are present even if the entity property is @Exclude() on User
    const docs = this.usersService.normalizeVerificationDocuments(
      (user as any).verificationDocuments,
    );
    return {
      ...(dto as any),
      verificationDocuments: docs,
    } as AdminUserResponseDto;
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

  @Patch('users/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivateUser(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.reactivate(id);
  }

  @Delete('users/:id/hard')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async hardDeleteUser(@Param('id', ParseIntPipe) id: number) {
    // Performs anonymizing hard delete (scrubs PII & frees email; keeps row for FK integrity)
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
    @Body() dto: AssignDelivererDto,
  ) {
    const delivererId = this.ensureDelivererId(dto);
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  // ===== Alias routes for frontend compatibility =====
  @Put('orders/:id/assign')
  @Header('Deprecation', 'true')
  async assignDelivererPut(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignDelivererDto,
    @Query() query?: AssignDelivererDto,
  ) {
    const delivererId = this.ensureDelivererId(body?.delivererId ? body : query);
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Patch('orders/:id/assign')
  @Header('Deprecation', 'true')
  async assignDelivererAssignPatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignDelivererDto,
    @Query() query?: AssignDelivererDto,
  ) {
    const delivererId = this.ensureDelivererId(body?.delivererId ? body : query);
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Post('orders/:id/assign')
  @Header('Deprecation', 'true')
  async assignDelivererAssignPost(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignDelivererDto,
    @Query() query?: AssignDelivererDto,
  ) {
    const delivererId = this.ensureDelivererId(body?.delivererId ? body : query);
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Patch('orders/:id/deliverer')
  @Header('Deprecation', 'true')
  async assignDelivererPatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignDelivererDto,
    @Query() query?: AssignDelivererDto,
  ) {
    const delivererId = this.ensureDelivererId(body?.delivererId ? body : query);
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Post('orders/:id/deliverer')
  @Header('Deprecation', 'true')
  async assignDelivererPost(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignDelivererDto,
    @Query() query?: AssignDelivererDto,
  ) {
    const delivererId = this.ensureDelivererId(body?.delivererId ? body : query);
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  // ================== PLATFORM STATS ENDPOINT ==================
  @Get('stats')
  async getStats(): Promise<AdminStatsDto> {
    const [
      totalUsers,
      totalVendors,
      totalCustomers,
      totalAdmins,
      totalRevenue,
      totalOrders,
      pendingWithdrawals,
    ] = await Promise.all([
      this.usersService.countAll(),
      this.usersService.countByRole(UserRole.VENDOR),
      this.usersService.countByRole(UserRole.CUSTOMER),
      this.usersService.countByRole(UserRole.ADMIN),
      this.ordersService.getTotalRevenue(),
      this.ordersService.countAll(),
      this.withdrawalsService.countPendingWithdrawals(),
    ]);

    return {
      totalUsers,
      totalVendors,
      totalCustomers,
      totalAdmins,
      totalRevenue,
      totalOrders,
      pendingWithdrawals,
    };
  }

  // ================== WITHDRAWAL MANAGEMENT ENDPOINTS ==================
  @Get('withdrawals')
  async getAllWithdrawals(
    @Query('status', new ParseEnumPipe(WithdrawalStatus, { optional: true }))
    status?: WithdrawalStatus,
  ) {
    return this.withdrawalsService.getAllWithdrawals(status);
  }

  // ===== Helpers =====
  private ensureDelivererId(input?: AssignDelivererDto): number {
    const delivererId = Number(input?.delivererId);
    if (!delivererId || Number.isNaN(delivererId)) {
      throw new BadRequestException('delivererId is required');
    }
    return delivererId;
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
