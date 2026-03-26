import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { VendorService } from '../vendor/vendor.service';
import { UsersService } from '../users/users.service';
import {
  AuditFilters,
  AuditService,
  prettyAuditActionLabel,
} from '../audit/audit.service';
import { UpdateVendorVerificationDto } from './dto/update-vendor-verification.dto';
import { UpdateVendorActiveDto } from './dto/update-vendor-active.dto';
import { AdminVendorListQueryDto } from './dto/admin-vendor-list-query.dto';
import { AdminVendorSearchQueryDto } from './dto/admin-vendor-search-query.dto';
import { AuditQueryDto } from './dto/audit-query.dto';
import { SkipThrottle } from '@nestjs/throttler';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/vendors')
export class AdminVendorsController {
  constructor(
    private readonly vendorService: VendorService,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Post(':id/confirm-telebirr')
  async confirmTelebirr(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: 'APPROVED' | 'REJECTED',
    @Req() req: any,
  ) {
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new BadRequestException('Status must be APPROVED or REJECTED');
    }

    const user = await this.usersService.confirmTelebirrAccount(id, status);

    await this.audit.log({
      action: 'vendor.telebirr.verification',
      targetType: 'vendor',
      targetId: id,
      meta: { status, telebirrAccount: user.telebirrAccount || 'CLEARED' },
      actorId: req?.user?.id ?? null,
      actorEmail: req?.user?.email ?? null,
    });

    return { ok: true, telebirrVerified: user.telebirrVerified };
  }

  @Get()
  async list(@Query() query: AdminVendorListQueryDto) {
    const p = query.page ?? 1;
    const l = query.limit ?? 20;
    // Prioritize specific vendor ID if provided
    const effectiveSearch =
      query.vendorId != null ? String(query.vendorId) : query.search || query.q;

    const result = await this.vendorService.findPublicVendors({
      page: p,
      limit: l,
      search: effectiveSearch,
      sort: query.sort || 'recent',
      verificationStatus: query.verificationStatus,
      certificationStatus: query.certificationStatus,
      role: 'VENDOR',
      country: query.country,
      region: query.region,
      city: query.city,
      subscriptionTier: query.subscriptionTier,
      minSales: query.minSales,
      minRating: query.minRating,
      skipRoleFilter: true, // Allow admins to find any user (e.g. Suuq S default admin account)
      withProductsOnly: false,
    } as any);
    const payload = {
      items: result.items,
      total: result.total,
      page: result.currentPage,
      perPage: l,
      totalPages: result.totalPages,
    };
    return query.meta === '1'
      ? { data: payload.items, meta: payload }
      : payload;
  }

  // Lightweight search endpoint for admin autocomplete use-cases
  @Get('search')
  async search(@Query() query: AdminVendorSearchQueryDto) {
    const l = query.limit ?? 20;
    const result = await this.vendorService.findPublicVendors({
      page: 1,
      limit: l,
      search: query.q,
      certificationStatus: query.certificationStatus,
      subscriptionTier: query.subscriptionTier,
      sort: 'recent',
      skipRoleFilter: true, // Allow finding any user for admin purposes
      role: 'VENDOR',
      withProductsOnly: false,
    } as any);

    const payload = {
      items: result.items,
      total: result.total,
      page: result.currentPage,
      perPage: l,
      totalPages: result.totalPages,
    };
    return query.meta === '1'
      ? { data: payload.items, meta: payload }
      : payload;
  }

  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return await this.vendorService.getAdminVendorDetail(id);
  }

  @Get(':id/audit')
  async getAudit(
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
      .map((s) => s.trim())
      .filter(Boolean);
    const filters: AuditFilters = {
      actions: actionList.length ? actionList : undefined,
      actorEmail: query.actorEmail || undefined,
      actorId: query.actorId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    };

    if (useCursor) {
      const { items, nextCursor } = await this.audit.listForTargetCursor(
        'vendor',
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
    } = await this.audit.listForTargetPaged('vendor', id, {
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

  @Patch(':id/verification')
  async updateVerification(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVendorVerificationDto,
    @Req() req: any,
  ) {
    const updated = await this.vendorService.setVendorVerificationStatus(
      id,
      dto.status,
      dto.reason,
    );
    await this.audit.log({
      action: 'vendor.verification.update',
      targetType: 'vendor',
      targetId: id,
      reason: dto.reason || null,
      meta: { status: dto.status },
      actorId: req?.user?.id ?? null,
      actorEmail: req?.user?.email ?? null,
    });
    return { ok: true, vendorId: id, status: updated.verificationStatus };
  }

  @Patch(':id/active')
  async updateActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVendorActiveDto,
    @Req() req: any,
  ) {
    // Enforce SUPER_ADMIN for activate/deactivate on backend as well
    const roles: string[] = Array.isArray(req?.user?.roles)
      ? req.user.roles
      : [];
    if (!roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Only SUPER_ADMIN can change active state');
    }
    const updated = await this.vendorService.setVendorActiveState(
      id,
      dto.isActive,
    );
    await this.audit.log({
      action: 'vendor.active.update',
      targetType: 'vendor',
      targetId: id,
      meta: { isActive: dto.isActive },
      actorId: req?.user?.id ?? null,
      actorEmail: req?.user?.email ?? null,
    });
    return { ok: true, vendorId: id, isActive: updated.isActive };
  }
}
