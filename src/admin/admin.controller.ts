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
  Res,
  Req,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { SkipThrottle } from '@nestjs/throttler';
import { OrdersService } from '../orders/orders.service';
import { RolesGuard } from '../auth/roles.guard';
import { AuthGuard } from '@nestjs/passport'; // Import the built-in guard
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { CreateAdminDto } from './dto/create-admin.dto';
import { BulkUserIdsDto } from './dto/bulk-user-ids.dto';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import { FindUsersQueryDto } from '../users/dto/find-users-query.dto';
import { Response } from 'express';
import { CurrencyService } from '../common/services/currency.service';
import { ProductsService } from '../products/products.service';
import { DelivererService } from '../deliverer/deliverer.service';

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
    private readonly currencyService: CurrencyService,
    private readonly productsService: ProductsService,
    private readonly delivererService: DelivererService,
  ) {}

  // Prefer a specific route before the generic :id matcher to avoid ParseIntPipe errors
  @Get('users/stream')
  @Header('Content-Type', 'application/x-ndjson; charset=utf-8')
  async streamUsersNdjson(
    @Res() res: Response,
    @Query() filters: FindUsersQueryDto,
    @Query('chunkSize') chunkSize?: string,
  ) {
    const parsed = parseInt(String(chunkSize ?? ''), 10);
    const safeChunk = Math.min(
      Math.max(!isNaN(parsed) ? parsed : 100, 1),
      2000,
    );
    // Advise download filename and disable caching
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users.ndjson"');
    res.setHeader('Cache-Control', 'no-store');
    // Hint proxies for streaming
    res.setHeader('Transfer-Encoding', 'chunked');

    let aborted = false;
    // Express response carries the originating request; type with a safe cast.
    const req = (res as any).req as import('express').Request | undefined;
    if (req && typeof req.on === 'function') {
      req.on('close', () => {
        aborted = true;
      });
    }

    // Page through results to avoid loading everything in memory
    let page = 1;
    try {
      while (!aborted) {
        const { users } = await this.usersService.findAll({
          ...filters,
          page,
          pageSize: safeChunk,
          limit: safeChunk,
        });
        if (!users.length) break;
        for (const u of users) {
          if (aborted) break;
          const line = JSON.stringify({
            id: u.id,
            email: u.email,
            displayName: u.displayName ?? '',
            storeName: u.storeName ?? '',
            roles: Array.isArray(u.roles) ? u.roles : [],
            isActive: !!u.isActive,
            verificationStatus: u.verificationStatus ?? '',
            verificationMethod: (u as any).verificationMethod ?? '',
          });
          res.write(line + '\n');
        }
        if (users.length < safeChunk) break;
        page += 1;
        await new Promise((r) => setImmediate(r));
      }
    } catch {
      try {
        res.write(
          JSON.stringify({ error: true, message: 'stream_failed' }) + '\n',
        );
      } catch {
        /* ignore write failure */
      }
    } finally {
      try {
        res.end();
      } catch {
        /* ignore end failure */
      }
    }
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

    // Fetch product count for vendor stats
    const productCount = await this.productsService.countByVendor(id);

    return {
      ...(dto as any),
      verificationDocuments: docs,
      productCount,
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

  // FX rates snapshot for ops visibility
  @Get('fx-rates')
  getFxRates() {
    return this.currencyService.getRatesSnapshot();
  }

  // Manual refresh/override hook; pass {remote: true} to pull from feed when configured
  @Post('fx-rates/refresh')
  refreshFxRates(
    @Body() body: { rates?: Record<string, number>; remote?: boolean },
  ) {
    if (body?.remote) {
      return this.currencyService.refreshFromRemote();
    }
    // Accept either { rates: {...} } or a bare currency map payload
    return this.currencyService.refreshRates(body?.rates ?? body);
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

  // ================== USER EXPORT (CSV) ==================
  @Get('users/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportUsersCsv(
    @Res() res: Response,
    @Query() filters: FindUsersQueryDto,
    @Query('format') format?: string,
  ) {
    const fmt = (format || 'csv').toLowerCase();
    if (fmt !== 'csv') {
      throw new BadRequestException(
        'Only CSV export is supported at the moment',
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="users_export_${Date.now()}.csv"`,
    );
    // Do not cache exports
    res.setHeader('Cache-Control', 'no-store');

    // CSV header
    res.write(
      [
        'ID',
        'Email',
        'Display Name',
        'Store Name',
        'Roles',
        'Status',
        'Verification',
        'Method',
      ].join(',') + '\n',
    );

    // Stream in pages to avoid memory blowups
    let page = 1;
    const limit = Math.min(Number(filters.limit || 1000), 1000);
    // Ensure cross-role search rules/sorting are applied by service

    while (true) {
      const { users } = await this.usersService.findAll({
        ...filters,
        page,
        pageSize: limit,
        limit,
      });
      if (!users.length) break;
      for (const u of users) {
        const line = [
          u.id,
          JSON.stringify(u.email || ''),
          JSON.stringify(u.displayName || ''),
          JSON.stringify(u.storeName || ''),
          JSON.stringify((u.roles || []).join('|')),
          u.isActive ? 'active' : 'inactive',
          u.verificationStatus || '',
          u.verificationMethod || '',
        ].join(',');
        res.write(line + '\n');
      }
      if (users.length < limit) break;
      page += 1;
    }
    res.end();
  }

  // ================== ORDER MANAGEMENT ENDPOINTS ==================
  @Get('orders')
  async getAllOrders(
    @Query()
    query: {
      page?: number;
      pageSize?: number;
      status?: string;
      paymentMethod?: string;
      paymentStatus?: string;
      hasPaymentProof?: boolean | string;
      sort?: string;
      sortBy?: string;
      orderBy?: string;
      sortOrder?: 'ASC' | 'DESC' | 'asc' | 'desc';
      order?: 'ASC' | 'DESC' | 'asc' | 'desc';
    },
  ) {
    const result = await this.ordersService.findAllForAdmin(query as any);
    return { orders: result.data, total: result.total };
  }

  @Post('orders/:id/approve-payment')
  @HttpCode(HttpStatus.OK)
  async approvePayment(@Param('id', ParseIntPipe) id: number) {
    await this.ordersService.approveBankTransfer(id);
    return { success: true };
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
    const delivererId = this.ensureDelivererId(
      body?.delivererId ? body : query,
    );
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Patch('orders/:id/assign')
  @Header('Deprecation', 'true')
  async assignDelivererAssignPatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignDelivererDto,
    @Query() query?: AssignDelivererDto,
  ) {
    const delivererId = this.ensureDelivererId(
      body?.delivererId ? body : query,
    );
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Post('orders/:id/assign')
  @Header('Deprecation', 'true')
  async assignDelivererAssignPost(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignDelivererDto,
    @Query() query?: AssignDelivererDto,
  ) {
    const delivererId = this.ensureDelivererId(
      body?.delivererId ? body : query,
    );
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Patch('orders/:id/deliverer')
  @Header('Deprecation', 'true')
  async assignDelivererPatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignDelivererDto,
    @Query() query?: AssignDelivererDto,
  ) {
    const delivererId = this.ensureDelivererId(
      body?.delivererId ? body : query,
    );
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Post('orders/:id/deliverer')
  @Header('Deprecation', 'true')
  async assignDelivererPost(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignDelivererDto,
    @Query() query?: AssignDelivererDto,
  ) {
    const delivererId = this.ensureDelivererId(
      body?.delivererId ? body : query,
    );
    return this.ordersService.assignDeliverer(id, delivererId);
  }

  @Get('disputes')
  async getDisputes(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('status') status?: string,
  ) {
    const result = await this.ordersService.findAllDisputesForAdmin({
      page,
      limit,
      status,
    });
    return { disputes: result.data, total: result.total };
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
      fxSnapshot,
    ] = await Promise.all([
      this.usersService.countAll(),
      this.usersService.countByRole(UserRole.VENDOR),
      this.usersService.countByRole(UserRole.CUSTOMER),
      this.usersService.countByRole(UserRole.ADMIN),
      this.ordersService.getTotalRevenue(),
      this.ordersService.countAll(),
      this.currencyService.getRatesSnapshot(),
    ]);

    return {
      totalUsers,
      totalVendors,
      totalCustomers,
      totalAdmins,
      totalRevenue,
      totalOrders,
      currency: 'ETB',
      fxSource: fxSnapshot.source,
      fxUpdatedAt: fxSnapshot.updatedAt,
      fxLastFetchAt: fxSnapshot.lastFetchAt ?? null,
    };
  }

  // ===== Helpers =====
  private ensureDelivererId(input?: AssignDelivererDto): number {
    const delivererId = Number(input?.delivererId);
    if (!delivererId || Number.isNaN(delivererId)) {
      throw new BadRequestException('delivererId is required');
    }
    return delivererId;
  }

  // Fix for Admin/Vendor role conflict: Admin endpoints for item updates
  @Patch('orders/:orderId/items/:itemId/status')
  async updateOrderItemStatus(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body()
    dto: import('../vendor/dto/update-order-item-status.dto').UpdateOrderItemStatusDto,
  ) {
    return this.ordersService.updateOrderItemStatus(
      orderId,
      itemId,
      dto.status,
    );
  }

  @Patch('orders/:orderId/items/:itemId/tracking')
  async updateOrderItemTracking(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body()
    dto: import('../vendor/dto/update-order-item-tracking.dto').UpdateOrderItemTrackingDto,
  ) {
    return this.ordersService.updateOrderItemTracking(orderId, itemId, dto);
  }

  @Post('orders/:orderId/bypass-delivery')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async bypassDelivery(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    if (!reason || reason.length < 5) {
      throw new BadRequestException(
        'A valid reason is required for audit logs',
      );
    }
    return this.delivererService.adminForceDelivery(
      orderId,
      req.user.id,
      reason,
    );
  }
}
