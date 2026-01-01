import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { VendorService } from '../vendor/vendor.service';
import {
  AuditFilters,
  AuditService,
  prettyAuditActionLabel,
} from '../audit/audit.service';
import { UpdateVendorVerificationDto } from './dto/update-vendor-verification.dto';
import { UpdateVendorActiveDto } from './dto/update-vendor-active.dto';
import { SkipThrottle } from '@nestjs/throttler';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/vendors')
export class AdminVendorsController {
  constructor(
    private readonly vendorService: VendorService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: 'name' | 'recent' | 'popular' | 'verifiedAt',
    @Query('verificationStatus')
    verificationStatus?: 'APPROVED' | 'PENDING' | 'REJECTED',
    @Query('country') country?: string,
    @Query('region') region?: string,
    @Query('city') city?: string,
    @Query('minSales') minSales?: string,
    @Query('minRating') minRating?: string,
    @Query('meta') metaFlag?: string,
  ) {
    const p = Math.max(Number(page) || 1, 1);
    const l = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const minSalesNum =
      minSales !== undefined && minSales !== '' ? Number(minSales) : undefined;
    const minRatingNum =
      minRating !== undefined && minRating !== ''
        ? Number(minRating)
        : undefined;
    const result = await this.vendorService.findPublicVendors({
      page: p,
      limit: l,
      search: q,
      sort: sort || 'recent',
      verificationStatus,
      role: 'VENDOR',
      country,
      region,
      city,
      minSales: Number.isFinite(minSalesNum as any) ? minSalesNum : undefined,
      minRating: Number.isFinite(minRatingNum as any)
        ? minRatingNum
        : undefined,
    } as any);
    const payload = {
      items: result.items,
      total: result.total,
      page: result.currentPage,
      perPage: l,
      totalPages: result.totalPages,
    };
    return metaFlag === '1' ? { data: payload.items, meta: payload } : payload;
  }

  // Lightweight search endpoint for admin autocomplete use-cases
  @Get('search')
  async search(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('meta') metaFlag?: string,
  ) {
    const l = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const result = await this.vendorService.findPublicVendors({
      page: 1,
      limit: l,
      search: q,
      sort: 'recent',
      role: 'VENDOR',
    } as any);

    const payload = {
      items: result.items,
      total: result.total,
      page: result.currentPage,
      perPage: l,
      totalPages: result.totalPages,
    };
    return metaFlag === '1' ? { data: payload.items, meta: payload } : payload;
  }

  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return await this.vendorService.getAdminVendorDetail(id);
  }

  @Get(':id/audit')
  async getAudit(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('after') after?: string,
    @Query('actions') actions?: string, // CSV list
    @Query('actorEmail') actorEmail?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
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

    const toDate = (value?: string) => {
      if (!value) return undefined;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };

    const p = Math.max(Number(page) || 1, 1);
    const l = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const useCursor = !!after;
    const actionList = (actions || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const filters: AuditFilters = {
      actions: actionList.length ? actionList : undefined,
      actorEmail: actorEmail || undefined,
      actorId: actorId ? Number(actorId) : undefined,
      from: toDate(from),
      to: toDate(to),
    };

    if (useCursor) {
      const { items, nextCursor } = await this.audit.listForTargetCursor(
        'vendor',
        id,
        { after, limit: l, filters },
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
