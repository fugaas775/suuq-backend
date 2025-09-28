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
import { AuditService } from '../audit/audit.service';
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
    return {
      items: result.items,
      total: result.total,
      page: result.currentPage,
      perPage: l,
      totalPages: result.totalPages,
    };
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
    const p = Math.max(Number(page) || 1, 1);
    const l = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const useCursor = !!after;
    const actionList = (actions || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const filters = {
      actions: actionList.length ? actionList : undefined,
      actorEmail: actorEmail || undefined,
      actorId: actorId ? Number(actorId) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    } as any;

    // Build using the service query builder helpers indirectly by calling the paged/cursor methods and then filtering via controller-level composition is tricky.
    // For simplicity and minimal changes, we’ll filter using the service’s applyFilters via a tiny internal helper.
    const repo: any = (this.audit as any).repo;
    const qb = repo
      .createQueryBuilder('a')
      .where('a.targetType = :targetType AND a.targetId = :targetId', {
        targetType: 'vendor',
        targetId: id,
      })
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC');
    this.audit.applyFilters(qb, filters);

    if (useCursor) {
      const { createdAt, id: cid } = this.audit.decodeCursor(after);
      if (createdAt && cid) {
        qb.andWhere(
          '(a.createdAt < :createdAt OR (a.createdAt = :createdAt AND a.id < :cid))',
          { createdAt, cid },
        );
      }
      qb.take(l + 1);
      const rows = await qb.getMany();
      const itemsRows = rows.slice(0, l);
      const nextCursor =
        rows.length > l
          ? this.audit.encodeCursor(itemsRows[itemsRows.length - 1])
          : null;
      const items = itemsRows.map((it: any) => ({
        id: it.id,
        action: it.action,
        actionLabel: label(it.action, it.meta),
        reason: it.reason || null,
        actorId: it.actorId || null,
        actorEmail: it.actorEmail || null,
        meta: it.meta || null,
        createdAt: it.createdAt,
      }));
      return { items, nextCursor };
    } else {
      qb.skip((p - 1) * l).take(l);
      const [rows, total] = await qb.getManyAndCount();
      const items = rows.map((it: any) => ({
        id: it.id,
        action: it.action,
        actionLabel: label(it.action, it.meta),
        reason: it.reason || null,
        actorId: it.actorId || null,
        actorEmail: it.actorEmail || null,
        meta: it.meta || null,
        createdAt: it.createdAt,
      }));
      return {
        items,
        total,
        page: p,
        perPage: l,
        totalPages: Math.ceil(total / l),
      };
    }
    const label = (action: string, meta?: any) => {
      switch (action) {
        case 'vendor.verification.update': {
          const s = meta?.status;
          if (s === 'APPROVED') return 'Approved vendor';
          if (s === 'REJECTED') return 'Rejected vendor';
          if (s === 'PENDING') return 'Set vendor to pending';
          if (s === 'SUSPENDED') return 'Suspended vendor';
          return 'Updated verification status';
        }
        case 'vendor.active.update': {
          const a = meta?.isActive;
          if (a === true) return 'Activated vendor';
          if (a === false) return 'Deactivated vendor';
          return 'Changed active state';
        }
        default:
          return action;
      }
    };
    // Unreachable due to early returns above
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
