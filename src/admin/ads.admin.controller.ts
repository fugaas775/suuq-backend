import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { TelebirrTransaction } from '../payments/entities/telebirr-transaction.entity';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/ads')
export class AdminAdsController {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(TelebirrTransaction)
    private readonly telebirrTxRepo: Repository<TelebirrTransaction>,
    @InjectRepository(EbirrTransaction)
    private readonly ebirrTxRepo: Repository<EbirrTransaction>,
  ) {}

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  @Get('audit')
  async getAdsAudit(
    @Query('state') state?: 'active' | 'expired' | 'all',
    @Query('page') pageRaw?: string,
    @Query('per_page') perPageRaw?: string,
    @Query('q') q?: string,
  ) {
    const page = Math.max(Number(pageRaw || 1), 1);
    const perPage = Math.min(Math.max(Number(perPageRaw || 20), 1), 200);
    const now = new Date();
    const search = String(q || '').trim();

    const baseQb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.vendor', 'vendor')
      .leftJoinAndSelect('p.category', 'category')
      .where('p.featured = :featured', { featured: true })
      .andWhere('p.deletedAt IS NULL');

    if (search) {
      baseQb.andWhere(
        '(p.name ILIKE :q OR p.description ILIKE :q OR vendor.storeName ILIKE :q OR vendor.displayName ILIKE :q)',
        { q: `%${search}%` },
      );
    }

    if (state === 'active') {
      baseQb.andWhere(
        '(p.featuredExpiresAt IS NULL OR p.featuredExpiresAt > :now)',
        {
          now,
        },
      );
    } else if (state === 'expired') {
      baseQb.andWhere(
        'p.featuredExpiresAt IS NOT NULL AND p.featuredExpiresAt <= :now',
        {
          now,
        },
      );
    }

    const [rows, total] = await baseQb
      .orderBy('p.featuredExpiresAt', 'ASC', 'NULLS LAST')
      .addOrderBy('p.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();

    const successStates = ['SUCCESS', 'COMPLETED', 'PAID'];

    const totalsRaw = await this.productRepo
      .createQueryBuilder('p')
      .select('COUNT(*)', 'featured_total')
      .addSelect(
        'SUM(CASE WHEN (p.featuredExpiresAt IS NULL OR p.featuredExpiresAt > :now) THEN 1 ELSE 0 END)',
        'active_total',
      )
      .addSelect(
        'SUM(CASE WHEN p.featuredExpiresAt IS NOT NULL AND p.featuredExpiresAt <= :now THEN 1 ELSE 0 END)',
        'expired_total',
      )
      .addSelect(
        "SUM(CASE WHEN p.status <> 'publish' THEN 1 ELSE 0 END)",
        'unpublished_total',
      )
      .addSelect(
        'SUM(CASE WHEN p.isBlocked = true THEN 1 ELSE 0 END)',
        'blocked_total',
      )
      .where('p.featured = :featured', { featured: true })
      .andWhere('p.deletedAt IS NULL')
      .setParameter('now', now)
      .getRawOne<{
        featured_total: string;
        active_total: string;
        expired_total: string;
        unpublished_total: string;
        blocked_total: string;
      }>();

    const items = await Promise.all(
      rows.map(async (p) => {
        const teleTx = await this.telebirrTxRepo
          .createQueryBuilder('tx')
          .where('tx.merch_order_id LIKE :prefix', {
            prefix: `BOOST-${p.id}-%`,
          })
          .andWhere('UPPER(tx.status) IN (:...states)', {
            states: successStates,
          })
          .orderBy('tx.created_at', 'DESC')
          .getOne();

        const ebirrTx = await this.ebirrTxRepo
          .createQueryBuilder('tx')
          .where('tx.merch_order_id LIKE :prefix', {
            prefix: `BOOST-${p.id}-%`,
          })
          .andWhere('UPPER(tx.status) IN (:...states)', {
            states: successStates,
          })
          .orderBy('tx.created_at', 'DESC')
          .getOne();

        const latestTx =
          teleTx && ebirrTx
            ? new Date(teleTx.created_at) > new Date(ebirrTx.created_at)
              ? {
                  provider: 'TELEBIRR',
                  amount: Number(teleTx.amount || 0),
                  currency: 'ETB',
                  paidAt: teleTx.created_at,
                  reference: teleTx.merch_order_id,
                }
              : {
                  provider: 'EBIRR',
                  amount: Number(ebirrTx.amount || 0),
                  currency: ebirrTx.currency || 'ETB',
                  paidAt: ebirrTx.created_at,
                  reference: ebirrTx.merch_order_id,
                }
            : teleTx
              ? {
                  provider: 'TELEBIRR',
                  amount: Number(teleTx.amount || 0),
                  currency: 'ETB',
                  paidAt: teleTx.created_at,
                  reference: teleTx.merch_order_id,
                }
              : ebirrTx
                ? {
                    provider: 'EBIRR',
                    amount: Number(ebirrTx.amount || 0),
                    currency: ebirrTx.currency || 'ETB',
                    paidAt: ebirrTx.created_at,
                    reference: ebirrTx.merch_order_id,
                  }
                : null;

        const isExpired =
          !!p.featuredExpiresAt && new Date(p.featuredExpiresAt) <= now;
        const isActive =
          !p.featuredExpiresAt || new Date(p.featuredExpiresAt) > now;
        const visibilityState = p.isBlocked
          ? 'blocked'
          : p.status === 'publish'
            ? 'published'
            : 'unpublished';

        return {
          id: p.id,
          name: p.name,
          sku: p.sku || null,
          status: p.status,
          isBlocked: p.isBlocked,
          visibilityState,
          featured: p.featured,
          featuredExpiresAt: p.featuredExpiresAt || null,
          featuredPaidAmount:
            typeof p.featuredPaidAmount === 'number'
              ? p.featuredPaidAmount
              : p.featuredPaidAmount
                ? Number(p.featuredPaidAmount)
                : null,
          featuredPaidCurrency: p.featuredPaidCurrency || null,
          activityState: isActive
            ? 'active'
            : isExpired
              ? 'expired'
              : 'inactive',
          vendor: p.vendor
            ? {
                id: p.vendor.id,
                storeName: p.vendor.storeName || null,
                displayName: p.vendor.displayName || null,
              }
            : null,
          category: p.category
            ? {
                id: p.category.id,
                name: p.category.name,
              }
            : null,
          hasPayment: !!latestTx,
          payment: latestTx,
        };
      }),
    );

    return {
      summary: {
        totalFeatured: Number(totalsRaw?.featured_total || 0),
        activeFeatured: Number(totalsRaw?.active_total || 0),
        expiredFeatured: Number(totalsRaw?.expired_total || 0),
        unpublishedFeatured: Number(totalsRaw?.unpublished_total || 0),
        blockedFeatured: Number(totalsRaw?.blocked_total || 0),
      },
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.max(Math.ceil(total / perPage), 1),
      },
      items,
    };
  }

  @Get('revenue')
  async getAdsRevenue(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('granularity') granularity?: 'daily' | 'monthly',
  ) {
    const fromDate = this.parseDate(from);
    const toDate = this.parseDate(to);

    if (from && !fromDate) {
      throw new BadRequestException('Invalid from date. Use ISO-8601 format.');
    }
    if (to && !toDate) {
      throw new BadRequestException('Invalid to date. Use ISO-8601 format.');
    }

    const rangeEnd = toDate || new Date();
    const rangeStart =
      fromDate || new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (rangeStart > rangeEnd) {
      throw new BadRequestException('from must be before to');
    }

    const successStates = ['SUCCESS', 'COMPLETED', 'PAID'];

    const teleDaily = await this.telebirrTxRepo
      .createQueryBuilder('tx')
      .select("DATE_TRUNC('day', tx.created_at)", 'bucket')
      .addSelect('COALESCE(SUM(tx.amount), 0)', 'amount')
      .addSelect('COUNT(*)', 'count')
      .where("tx.merch_order_id LIKE 'BOOST-%'")
      .andWhere('UPPER(tx.status) IN (:...states)', { states: successStates })
      .andWhere('tx.created_at >= :from AND tx.created_at <= :to', {
        from: rangeStart,
        to: rangeEnd,
      })
      .groupBy("DATE_TRUNC('day', tx.created_at)")
      .orderBy('bucket', 'ASC')
      .getRawMany<{ bucket: string; amount: string; count: string }>();

    const ebirrDaily = await this.ebirrTxRepo
      .createQueryBuilder('tx')
      .select("DATE_TRUNC('day', tx.created_at)", 'bucket')
      .addSelect('COALESCE(SUM(tx.amount), 0)', 'amount')
      .addSelect('COUNT(*)', 'count')
      .where("tx.merch_order_id LIKE 'BOOST-%'")
      .andWhere('UPPER(tx.status) IN (:...states)', { states: successStates })
      .andWhere('tx.created_at >= :from AND tx.created_at <= :to', {
        from: rangeStart,
        to: rangeEnd,
      })
      .groupBy("DATE_TRUNC('day', tx.created_at)")
      .orderBy('bucket', 'ASC')
      .getRawMany<{ bucket: string; amount: string; count: string }>();

    const teleMonthly = await this.telebirrTxRepo
      .createQueryBuilder('tx')
      .select("DATE_TRUNC('month', tx.created_at)", 'bucket')
      .addSelect('COALESCE(SUM(tx.amount), 0)', 'amount')
      .addSelect('COUNT(*)', 'count')
      .where("tx.merch_order_id LIKE 'BOOST-%'")
      .andWhere('UPPER(tx.status) IN (:...states)', { states: successStates })
      .andWhere('tx.created_at >= :from AND tx.created_at <= :to', {
        from: rangeStart,
        to: rangeEnd,
      })
      .groupBy("DATE_TRUNC('month', tx.created_at)")
      .orderBy('bucket', 'ASC')
      .getRawMany<{ bucket: string; amount: string; count: string }>();

    const ebirrMonthly = await this.ebirrTxRepo
      .createQueryBuilder('tx')
      .select("DATE_TRUNC('month', tx.created_at)", 'bucket')
      .addSelect('COALESCE(SUM(tx.amount), 0)', 'amount')
      .addSelect('COUNT(*)', 'count')
      .where("tx.merch_order_id LIKE 'BOOST-%'")
      .andWhere('UPPER(tx.status) IN (:...states)', { states: successStates })
      .andWhere('tx.created_at >= :from AND tx.created_at <= :to', {
        from: rangeStart,
        to: rangeEnd,
      })
      .groupBy("DATE_TRUNC('month', tx.created_at)")
      .orderBy('bucket', 'ASC')
      .getRawMany<{ bucket: string; amount: string; count: string }>();

    const mergeBuckets = (
      primary: Array<{ bucket: string; amount: string; count: string }>,
      secondary: Array<{ bucket: string; amount: string; count: string }>,
    ) => {
      const map = new Map<
        string,
        {
          bucket: string;
          total: number;
          telebirr: number;
          ebirr: number;
          count: number;
        }
      >();

      for (const row of primary) {
        const key = new Date(row.bucket).toISOString();
        const entry = map.get(key) || {
          bucket: key,
          total: 0,
          telebirr: 0,
          ebirr: 0,
          count: 0,
        };
        const amount = Number(row.amount || 0);
        const count = Number(row.count || 0);
        entry.total += amount;
        entry.telebirr += amount;
        entry.count += count;
        map.set(key, entry);
      }

      for (const row of secondary) {
        const key = new Date(row.bucket).toISOString();
        const entry = map.get(key) || {
          bucket: key,
          total: 0,
          telebirr: 0,
          ebirr: 0,
          count: 0,
        };
        const amount = Number(row.amount || 0);
        const count = Number(row.count || 0);
        entry.total += amount;
        entry.ebirr += amount;
        entry.count += count;
        map.set(key, entry);
      }

      return Array.from(map.values()).sort((a, b) =>
        a.bucket.localeCompare(b.bucket),
      );
    };

    const daily = mergeBuckets(teleDaily, ebirrDaily);
    const monthly = mergeBuckets(teleMonthly, ebirrMonthly);

    const totals = {
      total: daily.reduce((sum, row) => sum + row.total, 0),
      telebirr: daily.reduce((sum, row) => sum + row.telebirr, 0),
      ebirr: daily.reduce((sum, row) => sum + row.ebirr, 0),
      transactions: daily.reduce((sum, row) => sum + row.count, 0),
    };

    const selectedGranularity = String(granularity || '').toLowerCase();
    if (
      selectedGranularity &&
      selectedGranularity !== 'daily' &&
      selectedGranularity !== 'monthly'
    ) {
      throw new BadRequestException(
        'Invalid granularity. Use daily or monthly.',
      );
    }

    const timeseries: Record<string, unknown> = {};
    if (!selectedGranularity || selectedGranularity === 'daily') {
      timeseries.daily = daily;
    }
    if (!selectedGranularity || selectedGranularity === 'monthly') {
      timeseries.monthly = monthly;
    }

    return {
      range: {
        from: rangeStart.toISOString(),
        to: rangeEnd.toISOString(),
      },
      currency: 'ETB',
      granularity: selectedGranularity || 'all',
      totals,
      timeseries,
    };
  }
}
