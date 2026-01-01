/* eslint-disable @typescript-eslint/no-unsafe-assignment, prettier/prettier */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

export type AuditFilters = {
  actions?: string[];
  actorEmail?: string;
  actorId?: number;
  from?: Date;
  to?: Date;
};

export function prettyAuditActionLabel(action?: string, meta?: Record<string, any> | null) {
  switch (action) {
    case 'vendor.verification.update': {
      const s = meta?.status;
      if (s === 'APPROVED') return 'Approved vendor';
      if (s === 'REJECTED') return 'Rejected vendor';
      if (s === 'PENDING') return 'Set vendor to pending';
      if (s === 'SUSPENDED') return 'Suspended vendor';
      return 'Updated vendor verification';
    }
    case 'vendor.active.update': {
      const a = meta?.isActive;
      if (a === true) return 'Activated vendor';
      if (a === false) return 'Deactivated vendor';
      return 'Changed vendor active state';
    }
    case 'SELF_PURCHASE_BLOCKED':
      return 'Self purchase blocked';
    case 'SIGNED_DOWNLOAD_ISSUED':
      return 'Signed download issued';
    case 'SIGNED_DOWNLOAD_FREE':
      return 'Free product download';
    case 'ADMIN_PRODUCT_SOFT_DELETE':
      return 'Product soft deleted';
    case 'ADMIN_PRODUCT_RESTORE':
      return 'Product restored';
    case 'ADMIN_PRODUCT_HARD_DELETE':
      return 'Product hard deleted';
    default:
      return action || 'update';
  }
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  private clampLimit(limit?: number, fallback = 20, max = 100) {
    return Math.min(Math.max(Number(limit) || fallback, 1), max);
  }

  private buildBaseQuery(targetType: string, targetId: number) {
    return this.repo
      .createQueryBuilder('a')
      .where('a.targetType = :targetType AND a.targetId = :targetId', {
        targetType,
        targetId,
      })
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC');
  }

  private buildGlobalQuery(targetType?: string, targetId?: number) {
    const qb = this.repo
      .createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC');
    if (targetType) qb.andWhere('a.targetType = :targetType', { targetType });
    if (Number.isFinite(targetId)) qb.andWhere('a.targetId = :targetId', { targetId });
    return qb;
  }

  async log(entry: {
    actorId?: number | null;
    actorEmail?: string | null;
    action: string;
    targetType: string;
    targetId: number;
    reason?: string | null;
    meta?: Record<string, any> | null;
  }) {
    const log = this.repo.create({
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason ?? null,
      meta: entry.meta ?? null,
    });
    return this.repo.save(log);
  }

  async listForTarget(targetType: string, targetId: number, limit = 20) {
    const l = this.clampLimit(limit);
    return this.buildBaseQuery(targetType, targetId).take(l).getMany();
  }

  async listForTargetPaged(
    targetType: string,
    targetId: number,
    opts: { page?: number; limit?: number; filters?: AuditFilters } = {},
  ) {
    const p = Math.max(Number(opts.page) || 1, 1);
    const l = this.clampLimit(opts.limit);
    const qb = this.buildBaseQuery(targetType, targetId)
      .skip((p - 1) * l)
      .take(l);
    this.applyFilters(qb, opts.filters);
    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page: p,
      perPage: l,
      totalPages: Math.ceil(total / l),
    };
  }

  // Cursor pagination: createdAt DESC, id DESC for tie-breaker
  encodeCursor(row: AuditLog) {
    return Buffer.from(
      `${row.createdAt?.toISOString() || ''}|${row.id}`,
    ).toString('base64url');
  }

  decodeCursor(cursor?: string): { createdAt?: Date; id?: number } {
    if (!cursor) return {};
    try {
      const [iso, idStr] = Buffer.from(cursor, 'base64url')
        .toString('utf8')
        .split('|');
      const createdAt = iso ? new Date(iso) : undefined;
      const id = idStr ? Number(idStr) : undefined;
      return { createdAt, id };
    } catch {
      return {};
    }
  }

  async listForTargetCursor(
    targetType: string,
    targetId: number,
    opts: { after?: string; limit?: number; filters?: AuditFilters } = {},
  ) {
    const l = this.clampLimit(opts.limit);
    const { createdAt, id } = this.decodeCursor(opts.after);
    const qb = this.buildBaseQuery(targetType, targetId).take(l + 1); // fetch one extra to detect next
    this.applyFilters(qb, opts.filters);

    if (createdAt && id) {
      qb.andWhere(
        '(a.createdAt < :createdAt OR (a.createdAt = :createdAt AND a.id < :id))',
        { createdAt, id },
      );
    }

    const rows = await qb.getMany();
    const items = rows.slice(0, l);
    const nextCursor =
      rows.length > l && items.length
        ? this.encodeCursor(items[items.length - 1])
        : null;
    return { items, nextCursor };
  }

  async listAllPaged(opts: {
    page?: number;
    limit?: number;
    filters?: AuditFilters;
    targetType?: string;
    targetId?: number;
  } = {}) {
    const p = Math.max(Number(opts.page) || 1, 1);
    const l = this.clampLimit(opts.limit);
    const qb = this.buildGlobalQuery(opts.targetType, opts.targetId)
      .skip((p - 1) * l)
      .take(l);
    this.applyFilters(qb, opts.filters);
    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page: p,
      perPage: l,
      totalPages: Math.ceil(total / l),
    };
  }

  async listAllCursor(opts: {
    after?: string;
    limit?: number;
    filters?: AuditFilters;
    targetType?: string;
    targetId?: number;
  } = {}) {
    const l = this.clampLimit(opts.limit);
    const { createdAt, id } = this.decodeCursor(opts.after);
    const qb = this.buildGlobalQuery(opts.targetType, opts.targetId).take(l + 1);
    this.applyFilters(qb, opts.filters);

    if (createdAt && id) {
      qb.andWhere(
        '(a.createdAt < :createdAt OR (a.createdAt = :createdAt AND a.id < :id))',
        { createdAt, id },
      );
    }

    const rows = await qb.getMany();
    const items = rows.slice(0, l);
    const nextCursor =
      rows.length > l && items.length
        ? this.encodeCursor(items[items.length - 1])
        : null;
    return { items, nextCursor };
  }

  /** Count audit logs for a target since a specific date (inclusive). */
  async countForTargetSince(
    targetType: string,
    targetId: number,
    from: Date,
  ): Promise<number> {
    return this.buildBaseQuery(targetType, targetId)
      .andWhere('a.createdAt >= :from', { from })
      .getCount();
  }

  // Apply filters helper used by controller via query builder chaining
  applyFilters(
    qb: ReturnType<Repository<AuditLog>['createQueryBuilder']>,
    filters?: AuditFilters,
  ) {
    if (!filters) return qb;
    if (filters.actions && filters.actions.length) {
      qb.andWhere('a.action IN (:...actions)', { actions: filters.actions });
    }
    if (filters.actorEmail) {
      qb.andWhere('a.actorEmail ILIKE :actorEmail', {
        actorEmail: `%${filters.actorEmail}%`,
      });
    }
    if (filters.actorId) {
      qb.andWhere('a.actorId = :actorId', { actorId: filters.actorId });
    }
    if (filters.from) {
      qb.andWhere('a.createdAt >= :from', { from: filters.from });
    }
    if (filters.to) {
      qb.andWhere('a.createdAt <= :to', { to: filters.to });
    }
    return qb;
  }
}
