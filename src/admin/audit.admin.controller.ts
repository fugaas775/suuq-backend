import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import {
  AuditFilters,
  AuditService,
  prettyAuditActionLabel,
} from '../audit/audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

const ALLOWED_TARGET_TYPES = new Set([
  'vendor',
  'ORDER_SELF_PURCHASE',
  'ORDER_ITEM_DOWNLOAD',
  'FREE_PRODUCT_DOWNLOAD',
  'PRODUCT',
]);

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/audit')
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async list(@Query() query: AuditQueryDto) {
    const mapItem = (it: any) => ({
      id: it.id,
      action: it.action,
      actionLabel: prettyAuditActionLabel(it.action, it.meta),
      reason: it.reason ?? null,
      actorId: it.actorId ?? null,
      actorEmail: it.actorEmail ?? null,
      meta: it.meta ?? null,
      targetType: it.targetType ?? null,
      targetId: it.targetId ?? null,
      createdAt: it.createdAt,
    });

    const toDate = (value?: string) => {
      if (!value) return undefined;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };

    const { page, limit, after, actions, actorEmail, actorId, from, to, targetType, targetId } = query;
    if (after && page) {
      throw new BadRequestException('Use either cursor (after) or page-based pagination, not both.');
    }
    if (targetType && !ALLOWED_TARGET_TYPES.has(targetType)) {
      throw new BadRequestException('Invalid targetType');
    }

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
      actorId: actorId ?? undefined,
      from: toDate(from),
      to: toDate(to),
    };

    const targetIdNum = Number.isFinite(targetId as any) ? targetId : undefined;

    if (useCursor) {
      const { items, nextCursor } = await this.audit.listAllCursor({
        after,
        limit: l,
        filters,
        targetType: targetType || undefined,
        targetId: targetIdNum,
      });
      return { items: items.map(mapItem), nextCursor };
    }

    const { items, total, perPage, totalPages, page: currentPage } =
      await this.audit.listAllPaged({
        page: p,
        limit: l,
        filters,
        targetType: targetType || undefined,
        targetId: targetIdNum,
      });

    return {
      items: items.map(mapItem),
      total,
      page: currentPage,
      perPage,
      totalPages,
    };
  }
}
