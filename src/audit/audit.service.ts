import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

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
    return this.repo.find({
      where: { targetType, targetId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(Number(limit) || 20, 1), 100),
    });
  }

  async listForTargetPaged(
    targetType: string,
    targetId: number,
    page = 1,
    limit = 20,
  ) {
    const p = Math.max(Number(page) || 1, 1);
    const l = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (p - 1) * l;
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.targetType = :targetType AND a.targetId = :targetId', {
        targetType,
        targetId,
      })
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .skip(skip)
      .take(l);
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
    opts: { after?: string; limit?: number },
  ) {
    const l = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
    const { createdAt, id } = this.decodeCursor(opts.after);
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.targetType = :targetType AND a.targetId = :targetId', {
        targetType,
        targetId,
      })
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .take(l + 1); // fetch one extra to detect next

    if (createdAt && id) {
      qb.andWhere(
        '(a.createdAt < :createdAt OR (a.createdAt = :createdAt AND a.id < :id))',
        { createdAt, id },
      );
    }

    const rows = await qb.getMany();
    const items = rows.slice(0, l);
    const nextCursor =
      rows.length > l ? this.encodeCursor(items[items.length - 1]) : null;
    return { items, nextCursor };
  }

  // Apply filters helper used by controller via query builder chaining
  applyFilters(
    qb: ReturnType<Repository<AuditLog>['createQueryBuilder']>,
    filters?: {
      actions?: string[];
      actorEmail?: string;
      actorId?: number;
      from?: Date;
      to?: Date;
    },
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
