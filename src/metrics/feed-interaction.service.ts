import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FeedInteraction } from './entities/feed-interaction.entity';
import { CreateFeedInteractionDto } from './dto/create-feed-interaction.dto';
import { Product } from '../products/entities/product.entity';

type FeedActionSummaryRow = {
  action: string;
  count: string;
};

type FeedTopProductRow = {
  productId: string;
  total: string;
  attributed: string;
  unattributed: string;
};

type TopProductsSortBy =
  | 'total'
  | 'attributed'
  | 'unattributed'
  | 'attributionRate';

type TopProductsSortOrder = 'asc' | 'desc';

type BucketGranularity = 'hour' | 'day';

type UnattributedBucketRow = {
  bucketStart: string;
  action: string;
  productId: string;
  count: string | number;
};

type AttributionTrendRow = {
  bucketStart: string;
  action: string;
  total: string | number;
  attributed: string | number;
  unattributed: string | number;
};

type AnomalyHealthOptions = {
  profile?: string;
  sinceHours?: number;
  baselineHours?: number;
  action?: string;
  tzOffsetMinutes?: number;
  minEvents?: number;
  minUnattributedEvents?: number;
  unattributedRateThreshold?: number;
  spikeMultiplier?: number;
};

type AnomalyProfile = 'strict' | 'relaxed' | 'custom';

@Injectable()
export class FeedInteractionService {
  private readonly logger = new Logger(FeedInteractionService.name);
  private static readonly VALID_ACTIONS = [
    'impression',
    'click',
    'wishlist',
    'add_to_cart',
    'buy_now',
  ] as const;

  constructor(
    @InjectRepository(FeedInteraction)
    private readonly feedInteractionRepository: Repository<FeedInteraction>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async logInteraction(
    dto: CreateFeedInteractionDto,
    userId?: string,
  ): Promise<void> {
    try {
      const interaction = this.feedInteractionRepository.create({
        ...dto,
        productId: String(dto.productId), // Ensure it's stored as a string
        userId,
      });
      await this.feedInteractionRepository.save(interaction);
    } catch (error) {
      // We don't want to fail the request if telemetry fails
      this.logger.error(
        `Failed to log feed interaction: ${error.message}`,
        error.stack,
      );
    }
  }

  async getSummary(sinceHours = 24) {
    const clampedHours = Number.isFinite(sinceHours)
      ? Math.min(Math.max(sinceHours, 1), 24 * 30)
      : 24;
    const since = new Date(Date.now() - clampedHours * 60 * 60 * 1000);

    const actionRows = await this.feedInteractionRepository
      .createQueryBuilder('fi')
      .select('fi.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .where('fi.createdAt >= :since', { since })
      .groupBy('fi.action')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany<FeedActionSummaryRow>();

    const [{ total = '0' } = { total: '0' }] =
      await this.feedInteractionRepository
        .createQueryBuilder('fi')
        .select('COUNT(*)', 'total')
        .where('fi.createdAt >= :since', { since })
        .getRawMany<{ total: string }>();

    const [{ attributed = '0' } = { attributed: '0' }] =
      await this.feedInteractionRepository
        .createQueryBuilder('fi')
        .select('COUNT(*)', 'attributed')
        .where('fi.createdAt >= :since', { since })
        .andWhere('fi.requestId IS NOT NULL')
        .andWhere("NULLIF(TRIM(fi.requestId), '') IS NOT NULL")
        .getRawMany<{ attributed: string }>();

    const actionMap = actionRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.action] = Number(row.count || 0);
      return acc;
    }, {});

    const totalCount = Number(total || 0);
    const attributedCount = Number(attributed || 0);
    const impressions = actionMap.impression || 0;
    const clicks = actionMap.click || 0;
    const addToCart = actionMap.add_to_cart || 0;
    const buyNow = actionMap.buy_now || 0;

    return {
      sinceHours: clampedHours,
      totals: {
        events: totalCount,
        attributedEvents: attributedCount,
        attributionRate: totalCount > 0 ? attributedCount / totalCount : 0,
      },
      actions: actionMap,
      funnel: {
        impressions,
        clicks,
        add_to_cart: addToCart,
        buy_now: buyNow,
        ctr: impressions > 0 ? clicks / impressions : 0,
        add_to_cart_rate: clicks > 0 ? addToCart / clicks : 0,
        buy_now_rate: clicks > 0 ? buyNow / clicks : 0,
      },
    };
  }

  private async getTopProductsByAction(
    action: 'buy_now' | 'add_to_cart',
    since: Date,
    limit: number,
    includeProduct: boolean,
    sortBy: TopProductsSortBy,
    sortOrder: TopProductsSortOrder,
  ) {
    const rows = await this.feedInteractionRepository
      .createQueryBuilder('fi')
      .select('fi.productId', 'productId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        `SUM(CASE WHEN fi.requestId IS NOT NULL AND NULLIF(TRIM(fi.requestId), '') IS NOT NULL THEN 1 ELSE 0 END)`,
        'attributed',
      )
      .addSelect(
        `SUM(CASE WHEN fi.requestId IS NULL OR NULLIF(TRIM(fi.requestId), '') IS NULL THEN 1 ELSE 0 END)`,
        'unattributed',
      )
      .where('fi.createdAt >= :since', { since })
      .andWhere('fi.action = :action', { action })
      .groupBy('fi.productId')
      .orderBy('COUNT(*)', 'DESC')
      .limit(limit)
      .getRawMany<FeedTopProductRow>();

    const mappedRows = rows.map((row) => {
      const total = Number(row.total || 0);
      const attributed = Number(row.attributed || 0);
      const unattributed = Number(row.unattributed || 0);
      return {
        productId: row.productId,
        total,
        attributed,
        unattributed,
        attributionRate: total > 0 ? attributed / total : 0,
      };
    });

    mappedRows.sort((a, b) => {
      const left = a[sortBy];
      const right = b[sortBy];
      return sortOrder === 'asc' ? left - right : right - left;
    });

    if (!includeProduct) {
      return mappedRows.map((row) => ({
        productId: row.productId,
        product: null,
        total: row.total,
        attributed: row.attributed,
        unattributed: row.unattributed,
        attributionRate: row.attributionRate,
      }));
    }

    const numericProductIds = mappedRows
      .map((row) => Number(row.productId))
      .filter((id) => Number.isInteger(id) && id > 0);

    const products = numericProductIds.length
      ? await this.productRepository.find({
          where: { id: In(numericProductIds) },
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            imageUrl: true,
          },
        })
      : [];

    const productMap = new Map(
      products.map((product) => [String(product.id), product]),
    );

    return mappedRows.map((row) => {
      const product = productMap.get(row.productId);
      return {
        productId: row.productId,
        product: product
          ? {
              id: product.id,
              name: product.name,
              price: product.price,
              currency: product.currency,
              imageUrl: product.imageUrl,
            }
          : null,
        total: row.total,
        attributed: row.attributed,
        unattributed: row.unattributed,
        attributionRate: row.attributionRate,
      };
    });
  }

  async getTopProductsSummary(
    sinceHours = 24,
    limit = 20,
    includeProduct = true,
    sortBy: string = 'total',
    sortOrder: string = 'desc',
  ) {
    const clampedHours = Number.isFinite(sinceHours)
      ? Math.min(Math.max(sinceHours, 1), 24 * 30)
      : 24;
    const clampedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 100)
      : 20;
    const normalizedSortBy: TopProductsSortBy = (
      ['total', 'attributed', 'unattributed', 'attributionRate'].includes(
        sortBy,
      )
        ? sortBy
        : 'total'
    ) as TopProductsSortBy;
    const normalizedSortOrder: TopProductsSortOrder =
      sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    const since = new Date(Date.now() - clampedHours * 60 * 60 * 1000);

    const [buyNow, addToCart] = await Promise.all([
      this.getTopProductsByAction(
        'buy_now',
        since,
        clampedLimit,
        includeProduct,
        normalizedSortBy,
        normalizedSortOrder,
      ),
      this.getTopProductsByAction(
        'add_to_cart',
        since,
        clampedLimit,
        includeProduct,
        normalizedSortBy,
        normalizedSortOrder,
      ),
    ]);

    return {
      sinceHours: clampedHours,
      limit: clampedLimit,
      includeProduct,
      sortBy: normalizedSortBy,
      sortOrder: normalizedSortOrder,
      actions: {
        buy_now: buyNow,
        add_to_cart: addToCart,
      },
    };
  }

  async getUnattributedTopProductsOverTime(
    sinceHours = 24,
    limitPerBucket = 10,
    bucket: string = 'hour',
    action?: string,
    includeProduct = true,
    tzOffsetMinutes = 0,
  ) {
    const clampedHours = Number.isFinite(sinceHours)
      ? Math.min(Math.max(sinceHours, 1), 24 * 30)
      : 24;
    const clampedLimit = Number.isFinite(limitPerBucket)
      ? Math.min(Math.max(limitPerBucket, 1), 100)
      : 10;
    const normalizedBucket: BucketGranularity =
      bucket === 'day' ? 'day' : 'hour';
    const clampedTzOffsetMinutes = Number.isFinite(tzOffsetMinutes)
      ? Math.min(Math.max(tzOffsetMinutes, -14 * 60), 14 * 60)
      : 0;
    const since = new Date(Date.now() - clampedHours * 60 * 60 * 1000);

    const selectedActions = action
      ? FeedInteractionService.VALID_ACTIONS.includes(action as any)
        ? [action]
        : [...FeedInteractionService.VALID_ACTIONS]
      : [...FeedInteractionService.VALID_ACTIONS];

    const rows = await this.feedInteractionRepository.query(
      `
        WITH ranked AS (
          SELECT
            DATE_TRUNC(
              $1,
              (fi."createdAt" + make_interval(mins => $5::int))
            ) - make_interval(mins => $5::int) AS "bucketStart",
            fi."action" AS "action",
            fi."productId" AS "productId",
            COUNT(*) AS "count",
            ROW_NUMBER() OVER (
              PARTITION BY
                DATE_TRUNC(
                  $1,
                  (fi."createdAt" + make_interval(mins => $5::int))
                ) - make_interval(mins => $5::int),
                fi."action"
              ORDER BY COUNT(*) DESC, fi."productId" ASC
            ) AS "rank"
          FROM "feed_interactions" fi
          WHERE fi."createdAt" >= $2
            AND (fi."requestId" IS NULL OR NULLIF(TRIM(fi."requestId"), '') IS NULL)
            AND fi."action" = ANY($3)
          GROUP BY
            DATE_TRUNC(
              $1,
              (fi."createdAt" + make_interval(mins => $5::int))
            ) - make_interval(mins => $5::int),
            fi."action",
            fi."productId"
        )
        SELECT "bucketStart", "action", "productId", "count"
        FROM ranked
        WHERE "rank" <= $4
        ORDER BY "bucketStart" DESC, "action" ASC, "count" DESC
      `,
      [
        normalizedBucket,
        since.toISOString(),
        selectedActions,
        clampedLimit,
        clampedTzOffsetMinutes,
      ],
    );

    const typedRows = rows as UnattributedBucketRow[];

    const numericProductIds = typedRows
      .map((row) => Number(row.productId))
      .filter((id) => Number.isInteger(id) && id > 0);

    const products =
      includeProduct && numericProductIds.length
        ? await this.productRepository.find({
            where: { id: In(numericProductIds) },
            select: {
              id: true,
              name: true,
              price: true,
              currency: true,
              imageUrl: true,
            },
          })
        : [];

    const productMap = new Map(
      products.map((product) => [String(product.id), product]),
    );
    const grouped = new Map<
      string,
      {
        bucketStart: string;
        action: string;
        topProducts: Array<{
          productId: string;
          product: {
            id: number;
            name: string;
            price: number;
            currency: string;
            imageUrl: string | null;
          } | null;
          unattributed: number;
        }>;
      }
    >();

    for (const row of typedRows) {
      const key = `${row.bucketStart}::${row.action}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          bucketStart: row.bucketStart,
          action: row.action,
          topProducts: [],
        });
      }

      const product = productMap.get(row.productId);
      grouped.get(key)?.topProducts.push({
        productId: row.productId,
        product: product
          ? {
              id: product.id,
              name: product.name,
              price: product.price,
              currency: product.currency,
              imageUrl: product.imageUrl,
            }
          : null,
        unattributed: Number(row.count || 0),
      });
    }

    return {
      sinceHours: clampedHours,
      bucket: normalizedBucket,
      tzOffsetMinutes: clampedTzOffsetMinutes,
      limitPerBucket: clampedLimit,
      includeProduct,
      actions: selectedActions,
      buckets: Array.from(grouped.values()),
    };
  }

  async getAttributionTrendsHourly(
    sinceHours = 24,
    action?: string,
    tzOffsetMinutes = 0,
  ) {
    const clampedHours = Number.isFinite(sinceHours)
      ? Math.min(Math.max(sinceHours, 1), 24 * 30)
      : 24;
    const clampedTzOffsetMinutes = Number.isFinite(tzOffsetMinutes)
      ? Math.min(Math.max(tzOffsetMinutes, -14 * 60), 14 * 60)
      : 0;
    const since = new Date(Date.now() - clampedHours * 60 * 60 * 1000);
    const selectedActions = action
      ? FeedInteractionService.VALID_ACTIONS.includes(action as any)
        ? [action]
        : [...FeedInteractionService.VALID_ACTIONS]
      : [...FeedInteractionService.VALID_ACTIONS];

    const rows = await this.feedInteractionRepository.query(
      `
        WITH buckets AS (
          SELECT generate_series(
            date_trunc('hour', ($1::timestamptz + make_interval(mins => $3::int)))
              - make_interval(mins => $3::int),
            date_trunc('hour', (now() + make_interval(mins => $3::int)))
              - make_interval(mins => $3::int),
            interval '1 hour'
          ) AS bucket_start
        ),
        actions AS (
          SELECT unnest($2::text[]) AS action
        ),
        agg AS (
          SELECT
            date_trunc('hour', (fi."createdAt" + make_interval(mins => $3::int)))
              - make_interval(mins => $3::int) AS bucket_start,
            fi."action" AS action,
            COUNT(*) AS total,
            SUM(
              CASE WHEN fi."requestId" IS NOT NULL
                AND NULLIF(TRIM(fi."requestId"), '') IS NOT NULL
              THEN 1 ELSE 0 END
            ) AS attributed,
            SUM(
              CASE WHEN fi."requestId" IS NULL
                OR NULLIF(TRIM(fi."requestId"), '') IS NULL
              THEN 1 ELSE 0 END
            ) AS unattributed
          FROM "feed_interactions" fi
          WHERE fi."createdAt" >= $1
            AND fi."action" = ANY($2)
          GROUP BY
            date_trunc('hour', (fi."createdAt" + make_interval(mins => $3::int)))
              - make_interval(mins => $3::int),
            fi."action"
        )
        SELECT
          b.bucket_start AS "bucketStart",
          a.action AS "action",
          COALESCE(agg.total, 0) AS "total",
          COALESCE(agg.attributed, 0) AS "attributed",
          COALESCE(agg.unattributed, 0) AS "unattributed"
        FROM buckets b
        CROSS JOIN actions a
        LEFT JOIN agg
          ON agg.bucket_start = b.bucket_start
          AND agg.action = a.action
        ORDER BY b.bucket_start ASC, a.action ASC
      `,
      [since.toISOString(), selectedActions, clampedTzOffsetMinutes],
    );

    const typedRows = rows as AttributionTrendRow[];
    const grouped = new Map<
      string,
      {
        action: string;
        points: Array<{
          bucketStart: string;
          total: number;
          attributed: number;
          unattributed: number;
          attributionRate: number;
          unattributedRate: number;
        }>;
      }
    >();

    for (const row of typedRows) {
      const total = Number(row.total || 0);
      const attributed = Number(row.attributed || 0);
      const unattributed = Number(row.unattributed || 0);
      if (!grouped.has(row.action)) {
        grouped.set(row.action, { action: row.action, points: [] });
      }
      grouped.get(row.action)?.points.push({
        bucketStart: row.bucketStart,
        total,
        attributed,
        unattributed,
        attributionRate: total > 0 ? attributed / total : 0,
        unattributedRate: total > 0 ? unattributed / total : 0,
      });
    }

    return {
      sinceHours: clampedHours,
      bucket: 'hour',
      tzOffsetMinutes: clampedTzOffsetMinutes,
      actions: selectedActions,
      series: Array.from(grouped.values()),
    };
  }

  async getAnomalyHealth(options: AnomalyHealthOptions = {}) {
    const profile: AnomalyProfile =
      options.profile === 'strict'
        ? 'strict'
        : options.profile === 'relaxed'
          ? 'relaxed'
          : 'custom';

    const profileDefaults =
      profile === 'strict'
        ? {
            sinceHours: 12,
            baselineHours: 3,
            minEvents: 10,
            minUnattributedEvents: 3,
            unattributedRateThreshold: 0.12,
            spikeMultiplier: 1.7,
            recommendedPollSeconds: 300,
          }
        : profile === 'relaxed'
          ? {
              sinceHours: 24,
              baselineHours: 8,
              minEvents: 40,
              minUnattributedEvents: 10,
              unattributedRateThreshold: 0.3,
              spikeMultiplier: 2.5,
              recommendedPollSeconds: 900,
            }
          : {
              sinceHours: 24,
              baselineHours: 6,
              minEvents: 20,
              minUnattributedEvents: 5,
              unattributedRateThreshold: 0.2,
              spikeMultiplier: 2,
              recommendedPollSeconds: 600,
            };

    const sinceHours = Number.isFinite(options.sinceHours)
      ? Math.min(Math.max(options.sinceHours, 2), 24 * 30)
      : profileDefaults.sinceHours;
    const baselineHours = Number.isFinite(options.baselineHours)
      ? Math.min(Math.max(options.baselineHours, 1), 24 * 7)
      : profileDefaults.baselineHours;
    const tzOffsetMinutes = Number.isFinite(options.tzOffsetMinutes)
      ? Math.min(Math.max(options.tzOffsetMinutes, -14 * 60), 14 * 60)
      : 0;
    const minEvents = Number.isFinite(options.minEvents)
      ? Math.min(Math.max(options.minEvents, 1), 1_000_000)
      : profileDefaults.minEvents;
    const minUnattributedEvents = Number.isFinite(options.minUnattributedEvents)
      ? Math.min(Math.max(options.minUnattributedEvents, 1), 1_000_000)
      : profileDefaults.minUnattributedEvents;
    const unattributedRateThreshold = Number.isFinite(
      options.unattributedRateThreshold,
    )
      ? Math.min(Math.max(options.unattributedRateThreshold, 0), 1)
      : profileDefaults.unattributedRateThreshold;
    const spikeMultiplier = Number.isFinite(options.spikeMultiplier)
      ? Math.min(Math.max(options.spikeMultiplier, 1), 100)
      : profileDefaults.spikeMultiplier;

    const trends = await this.getAttributionTrendsHourly(
      sinceHours,
      options.action,
      tzOffsetMinutes,
    );

    const breaches: Array<{
      action: string;
      bucketStart: string;
      total: number;
      attributed: number;
      unattributed: number;
      unattributedRate: number;
      baselineUnattributedRate: number;
      reasons: string[];
    }> = [];

    for (const series of trends.series) {
      const points = series.points;
      if (!points.length) continue;

      const latest = points[points.length - 1];
      const baselineSlice = points.slice(
        Math.max(0, points.length - 1 - baselineHours),
        points.length - 1,
      );
      const baselineTotals = baselineSlice.reduce(
        (acc, point) => {
          acc.total += point.total;
          acc.unattributed += point.unattributed;
          return acc;
        },
        { total: 0, unattributed: 0 },
      );
      const baselineRate =
        baselineTotals.total > 0
          ? baselineTotals.unattributed / baselineTotals.total
          : 0;

      const reasons: string[] = [];
      if (
        latest.total >= minEvents &&
        latest.unattributed >= minUnattributedEvents &&
        latest.unattributedRate >= unattributedRateThreshold
      ) {
        reasons.push('threshold_breach');
      }

      if (
        latest.total >= minEvents &&
        latest.unattributed >= minUnattributedEvents &&
        baselineTotals.total > 0 &&
        baselineRate > 0 &&
        latest.unattributedRate >= baselineRate * spikeMultiplier
      ) {
        reasons.push('spike_vs_baseline');
      }

      if (reasons.length > 0) {
        breaches.push({
          action: series.action,
          bucketStart: latest.bucketStart,
          total: latest.total,
          attributed: latest.attributed,
          unattributed: latest.unattributed,
          unattributedRate: latest.unattributedRate,
          baselineUnattributedRate: baselineRate,
          reasons,
        });
      }
    }

    const ok = breaches.length === 0;
    const status = ok ? 'ok' : 'alert';

    return {
      status,
      ok,
      profile,
      generatedAt: new Date().toISOString(),
      window: {
        sinceHours,
        baselineHours,
        tzOffsetMinutes,
      },
      polling: {
        recommendedIntervalSeconds: profileDefaults.recommendedPollSeconds,
      },
      thresholds: {
        minEvents,
        minUnattributedEvents,
        unattributedRateThreshold,
        spikeMultiplier,
      },
      summary: {
        actionsChecked: trends.series.length,
        breaches: breaches.length,
      },
      alertRouting: {
        shouldNotify: !ok,
        channels: ['pager', 'slack'],
      },
      alertPayload: !ok
        ? {
            status,
            generatedAt: new Date().toISOString(),
            breaches: breaches.map((breach) => ({
              action: breach.action,
              reasons: breach.reasons,
              unattributedRate: breach.unattributedRate,
              bucketStart: breach.bucketStart,
            })),
            message: `Feed attribution anomaly detected for ${breaches
              .map((breach) => breach.action)
              .join(', ')}`,
          }
        : null,
      breaches,
    };
  }
}
