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
import { BranchStaffService } from '../branch-staff/branch-staff.service';
import { AssignUserPosBranchDto } from './dto/assign-user-pos-branch.dto';
import { BranchStaffRole } from '../branch-staff/entities/branch-staff-assignment.entity';
import {
  AuditFilters,
  AuditService,
  prettyAuditActionLabel,
} from '../audit/audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { SellerWorkspaceService } from '../seller-workspace/seller-workspace.service';
import {
  SellerWorkspaceProfileResponseDto,
  SellerWorkspaceOverviewResponseDto,
} from '../seller-workspace/dto/seller-workspace-response.dto';
import { SellerWorkspaceQueryDto } from '../seller-workspace/dto/seller-workspace-query.dto';

const SELLER_ROLES = new Set([
  UserRole.VENDOR,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
]);

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
    private readonly branchStaffService: BranchStaffService,
    private readonly auditService: AuditService,
    private readonly sellerWorkspaceService: SellerWorkspaceService,
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
    const posAccess =
      await this.branchStaffService.getAdminPosAccessForUser(id);
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const sellerWorkspaceSummary = roles.some((role) => SELLER_ROLES.has(role))
      ? await this.safeGetSellerWorkspaceSummary(id)
      : null;
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
      posBranchAssignments: posAccess.branchAssignments,
      posWorkspaceActivationCandidates: posAccess.workspaceActivationCandidates,
      sellerWorkspaceSummary,
    } as AdminUserResponseDto;
  }

  @Get('users/:id/pos-access')
  async getUserPosAccess(@Param('id', ParseIntPipe) id: number) {
    return this.branchStaffService.getAdminPosAccessForUser(id);
  }

  @Get('users/:id/seller-workspace')
  async getUserSellerWorkspace(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SellerWorkspaceQueryDto,
  ): Promise<SellerWorkspaceProfileResponseDto> {
    await this.usersService.findById(id);
    return this.sellerWorkspaceService.getProfile(id, query.windowHours);
  }

  @Get('users/:id/seller-workspace/overview')
  async getUserSellerWorkspaceOverview(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: SellerWorkspaceQueryDto,
  ): Promise<SellerWorkspaceOverviewResponseDto> {
    await this.usersService.findById(id);
    return this.sellerWorkspaceService.getOverview(id, query.windowHours);
  }

  @Get('users/:id/audit')
  async getUserAudit(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: AuditQueryDto,
  ) {
    const mapItem = (it: any) => ({
      id: it.id,
      action: it.action,
      actionLabel: prettyAuditActionLabel(it.action, it.meta),
      reason: it.reason ?? null,
      actorId: it.actorId ?? null,
      actorEmail: it.actorEmail ?? null,
      meta: it.meta ?? null,
      createdAt: it.createdAt,
    });

    const p = query.page ?? 1;
    const l = query.limit ?? 20;
    const useCursor = !!query.after;
    const actionList = (query.actions || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const filters: AuditFilters = {
      actions: actionList.length ? actionList : undefined,
      actorEmail: query.actorEmail || undefined,
      actorId: query.actorId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    };

    if (useCursor) {
      const { items, nextCursor } = await this.auditService.listForTargetCursor(
        'user',
        id,
        { after: query.after, limit: l, filters },
      );
      return { items: items.map(mapItem), nextCursor };
    }

    const {
      items,
      total,
      perPage,
      totalPages,
      page: currentPage,
    } = await this.auditService.listForTargetPaged('user', id, {
      page: p,
      limit: l,
      filters,
    });

    return {
      items: items.map(mapItem),
      total,
      page: currentPage,
      perPage,
      totalPages,
    };
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

  @Post('users/:id/pos-assignments')
  async assignUserPosBranch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignUserPosBranchDto,
    @Req() req: any,
  ) {
    await this.usersService.findById(id);

    const assignment = await this.branchStaffService.assign(dto.branchId, {
      userId: id,
      role: dto.role,
      permissions: dto.permissions ?? [],
    });
    const posAccess =
      await this.branchStaffService.getAdminPosAccessForUser(id);
    const matchedAssignment = (posAccess.branchAssignments || []).find(
      (entry) => entry.branchId === assignment.branchId,
    );
    await this.auditService.log({
      action: 'user.pos.assignment.create',
      targetType: 'user',
      targetId: id,
      actorId: req?.user?.id ?? null,
      actorEmail: req?.user?.email ?? null,
      meta: {
        branchId: assignment.branchId,
        branchName: matchedAssignment?.branchName ?? null,
        retailTenantId: matchedAssignment?.retailTenantId ?? null,
        retailTenantName: matchedAssignment?.retailTenantName ?? null,
        role: assignment.role,
        permissions: Array.isArray(assignment.permissions)
          ? assignment.permissions
          : [],
      },
    });

    return {
      assignment: {
        id: assignment.id,
        branchId: assignment.branchId,
        userId: assignment.userId,
        role: assignment.role,
        permissions: Array.isArray(assignment.permissions)
          ? assignment.permissions
          : [],
        isActive: assignment.isActive,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      },
      branchAssignments: posAccess.branchAssignments,
      workspaceActivationCandidates: posAccess.workspaceActivationCandidates,
    };
  }

  @Delete('users/:id/pos-assignments/:branchId')
  async unassignUserPosBranch(
    @Param('id', ParseIntPipe) id: number,
    @Param('branchId', ParseIntPipe) branchId: number,
    @Req() req: any,
  ) {
    await this.usersService.findById(id);

    const existingPosAccess =
      await this.branchStaffService.getAdminPosAccessForUser(id);
    const matchedAssignment = (existingPosAccess.branchAssignments || []).find(
      (entry) => entry.branchId === branchId,
    );
    const assignment = await this.branchStaffService.unassign(branchId, id);
    await this.auditService.log({
      action: 'user.pos.assignment.remove',
      targetType: 'user',
      targetId: id,
      actorId: req?.user?.id ?? null,
      actorEmail: req?.user?.email ?? null,
      meta: {
        branchId: assignment.branchId,
        branchName: matchedAssignment?.branchName ?? null,
        retailTenantId: matchedAssignment?.retailTenantId ?? null,
        retailTenantName: matchedAssignment?.retailTenantName ?? null,
        role: assignment.role,
      },
    });
    const posAccess =
      await this.branchStaffService.getAdminPosAccessForUser(id);

    return {
      assignment: {
        id: assignment.id,
        branchId: assignment.branchId,
        userId: assignment.userId,
        role: assignment.role,
        permissions: Array.isArray(assignment.permissions)
          ? assignment.permissions
          : [],
        isActive: assignment.isActive,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      },
      branchAssignments: posAccess.branchAssignments,
      workspaceActivationCandidates: posAccess.workspaceActivationCandidates,
    };
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
      paymentLifecycleState?: string;
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

  @Get('orders/:id/payment-proof/signed')
  async getSignedPaymentProofForAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Query('ttl') ttl?: string,
  ) {
    return this.ordersService.getSignedPaymentProofForAdmin(id, ttl);
  }

  @Patch('orders/:id/payment-proof/status')
  async setPaymentProofStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: 'VERIFIED' | 'REJECTED',
  ) {
    if (status !== 'VERIFIED' && status !== 'REJECTED') {
      throw new BadRequestException('status must be VERIFIED or REJECTED');
    }
    return this.ordersService.setPaymentProofStatusForAdmin(id, status);
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
