import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * What a branch has receipted on its tills — today, this month, and when it
 * last sold — for the platform admin's Branches page.
 *
 * "Sales" here is money receipted: POS checkouts that still stand (not voided,
 * not failed), with returns taken off. For a hotel that is room payments taken,
 * not room-nights; a restaurant order counts once it is settled.
 *
 * Days and months follow the Addis Ababa calendar (UTC+3, no daylight saving).
 *
 * `pos_checkouts.occurredAt` is a timestamp WITHOUT time zone, written by this
 * process from a JS Date. Every boundary below is therefore passed as a JS Date
 * parameter, so it is serialised exactly the way the column was written and the
 * comparison holds whatever time zone the process runs in. Only the per-day
 * grouping has to do clock arithmetic in SQL, and it is told the offset.
 */

const ADDIS_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const STANDS = `c.status NOT IN ('VOIDED', 'FAILED')`;
const SIGNED = `(CASE WHEN c."transactionType" = 'RETURN' THEN -c.total ELSE c.total END)`;
const IS_SALE = `c."transactionType" = 'SALE'`;

export type BranchActivityFilter =
  | 'SOLD_TODAY'
  | 'SOLD_THIS_MONTH'
  | 'SILENT_7_DAYS'
  | 'NEVER_SOLD';

export type BranchSalesSort = 'today' | 'month' | 'lastSale';

export const BRANCH_ACTIVITY_FILTERS: readonly BranchActivityFilter[] = [
  'SOLD_TODAY',
  'SOLD_THIS_MONTH',
  'SILENT_7_DAYS',
  'NEVER_SOLD',
];
export const BRANCH_SALES_SORTS: readonly BranchSalesSort[] = [
  'today',
  'month',
  'lastSale',
];

export interface SalesFigure {
  net: number;
  count: number;
}

export interface BranchSalesSummary {
  today: SalesFigure;
  month: SalesFigure;
  lastSaleAt: Date | null;
  currency: string | null;
}

export interface BranchListScope {
  search?: string;
  serviceFormat?: string;
  isActive?: boolean;
}

export interface AddisCalendar {
  now: Date;
  dayStart: Date;
  tomorrowStart: Date;
  yesterdayStart: Date;
  monthStart: Date;
  lastMonthStart: Date;
  /** The same point in last month as `now` is in this one, capped at its end. */
  lastMonthSamePoint: Date;
  /** Start of the day 29 days ago: a 30-day window ending today. */
  thirtyDaysStart: Date;
  silentBefore: Date;
  /** Addis dates (YYYY-MM-DD) of the 30-day window, oldest first. */
  thirtyDayKeys: string[];
}

const addisDateKey = (instant: Date): string =>
  new Date(instant.getTime() + ADDIS_OFFSET_MS).toISOString().slice(0, 10);

/** The instants where Addis Ababa's days and months turn, around `now`. */
export function addisCalendar(now: Date = new Date()): AddisCalendar {
  const local = new Date(now.getTime() + ADDIS_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const at = (year: number, month: number, day: number) =>
    new Date(Date.UTC(year, month, day) - ADDIS_OFFSET_MS);

  const dayStart = at(y, m, d);
  const monthStart = at(y, m, 1);
  const lastMonthStart = at(y, m - 1, 1);
  const elapsedThisMonth = now.getTime() - monthStart.getTime();
  const lastMonthSamePoint = new Date(
    Math.min(lastMonthStart.getTime() + elapsedThisMonth, monthStart.getTime()),
  );
  const thirtyDaysStart = new Date(dayStart.getTime() - 29 * DAY_MS);

  return {
    now,
    dayStart,
    tomorrowStart: new Date(dayStart.getTime() + DAY_MS),
    yesterdayStart: new Date(dayStart.getTime() - DAY_MS),
    monthStart,
    lastMonthStart,
    lastMonthSamePoint,
    thirtyDaysStart,
    silentBefore: new Date(now.getTime() - 7 * DAY_MS),
    thirtyDayKeys: Array.from({ length: 30 }, (_, i) =>
      addisDateKey(new Date(thirtyDaysStart.getTime() + i * DAY_MS)),
    ),
  };
}

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const int = (value: unknown): number => Math.trunc(Number(value) || 0);
const dateOrNull = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** One row per branch that has receipted anything since the month began. */
const STATS_SQL = `
  SELECT c."branchId" AS "branchId",
         COALESCE(SUM(${SIGNED}) FILTER (WHERE c."occurredAt" >= $2), 0) AS "todayNet",
         COUNT(*) FILTER (WHERE c."occurredAt" >= $2 AND ${IS_SALE}) AS "todayCount",
         COALESCE(SUM(${SIGNED}), 0) AS "monthNet",
         COUNT(*) FILTER (WHERE ${IS_SALE}) AS "monthCount",
         MAX(c.currency) AS "currency"
    FROM pos_checkouts c
   WHERE ${STANDS}
     AND c."occurredAt" >= $1
     AND c."occurredAt" < $3`;

/** The branch's most recent sale; one backward index step per branch. */
const LAST_SALE_JOIN = `
  LEFT JOIN LATERAL (
    SELECT c."occurredAt"
      FROM pos_checkouts c
     WHERE c."branchId" = b.id AND ${IS_SALE} AND ${STANDS} AND c."occurredAt" < $3
     ORDER BY c."occurredAt" DESC
     LIMIT 1
  ) ls ON true`;

@Injectable()
export class BranchSalesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Today / this month / last sale for the given branches, in one round trip. */
  async summariesFor(
    branchIds: number[],
    now: Date = new Date(),
  ): Promise<Map<number, BranchSalesSummary>> {
    const out = new Map<number, BranchSalesSummary>();
    if (!branchIds.length) return out;
    const cal = addisCalendar(now);
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `WITH stats AS (${STATS_SQL} AND c."branchId" = ANY($4) GROUP BY c."branchId")
       SELECT b.id AS "branchId", s."todayNet", s."todayCount", s."monthNet",
              s."monthCount", s."currency", ls."occurredAt" AS "lastSaleAt"
         FROM branches b
         LEFT JOIN stats s ON s."branchId" = b.id
         ${LAST_SALE_JOIN}
        WHERE b.id = ANY($4)`,
      [cal.monthStart, cal.dayStart, cal.tomorrowStart, branchIds],
    );
    for (const row of rows) {
      out.set(int(row.branchId), {
        today: { net: num(row.todayNet), count: int(row.todayCount) },
        month: { net: num(row.monthNet), count: int(row.monthCount) },
        lastSaleAt: dateOrNull(row.lastSaleAt),
        currency: row.currency ? String(row.currency) : null,
      });
    }
    return out;
  }

  /**
   * The page of branch ids for a list ranked or filtered by sales — the one
   * case the ordinary repository query cannot answer, because the order
   * depends on the checkouts.
   */
  async rankBranchIds(
    scope: BranchListScope & {
      activity?: BranchActivityFilter;
      sort?: BranchSalesSort;
      order?: 'ASC' | 'DESC';
      page: number;
      limit: number;
    },
    now: Date = new Date(),
  ): Promise<{ ids: number[]; total: number }> {
    const cal = addisCalendar(now);
    const params: unknown[] = [cal.monthStart, cal.dayStart, cal.tomorrowStart];
    const where = this.scopeWhere(scope, params);

    switch (scope.activity) {
      case 'SOLD_TODAY':
        where.push(`COALESCE(s."todayCount", 0) > 0`);
        break;
      case 'SOLD_THIS_MONTH':
        where.push(`COALESCE(s."monthCount", 0) > 0`);
        break;
      case 'SILENT_7_DAYS':
        params.push(cal.silentBefore);
        where.push(
          `ls."occurredAt" IS NOT NULL AND ls."occurredAt" < $${params.length}`,
        );
        break;
      case 'NEVER_SOLD':
        where.push(`ls."occurredAt" IS NULL`);
        break;
      default:
        break;
    }

    const direction = scope.order === 'ASC' ? 'ASC' : 'DESC';
    const orderBy =
      scope.sort === 'today'
        ? `COALESCE(s."todayNet", 0) ${direction}, `
        : scope.sort === 'month'
          ? `COALESCE(s."monthNet", 0) ${direction}, `
          : scope.sort === 'lastSale'
            ? `ls."occurredAt" ${direction} NULLS LAST, `
            : '';

    params.push(scope.limit, (scope.page - 1) * scope.limit);
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `WITH stats AS (${STATS_SQL} GROUP BY c."branchId")
       SELECT b.id AS "id", COUNT(*) OVER() AS "total"
         FROM branches b
         LEFT JOIN stats s ON s."branchId" = b.id
         ${LAST_SALE_JOIN}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY ${orderBy}b."createdAt" DESC, b.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    if (rows.length) {
      return { ids: rows.map((r) => int(r.id)), total: int(rows[0].total) };
    }
    // A page past the end returns no rows, and so no window count.
    if (scope.page <= 1) return { ids: [], total: 0 };
    const first = await this.rankBranchIds(
      { ...scope, page: 1, limit: 1 },
      now,
    );
    return { ids: [], total: first.total };
  }

  /** Across the branches in scope: how many sold today, and how much. */
  async platformToday(
    scope: BranchListScope = {},
    now: Date = new Date(),
  ): Promise<{ soldTodayCount: number; todayNet: number; currency: string }> {
    const cal = addisCalendar(now);
    const params: unknown[] = [cal.dayStart, cal.dayStart, cal.tomorrowStart];
    const where = this.scopeWhere(scope, params);
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `WITH stats AS (${STATS_SQL} GROUP BY c."branchId")
       SELECT COUNT(*) FILTER (WHERE s."todayCount" > 0) AS "soldTodayCount",
              COALESCE(SUM(s."todayNet"), 0) AS "todayNet",
              MAX(s."currency") AS "currency"
         FROM branches b
         JOIN stats s ON s."branchId" = b.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
      params,
    );
    const row = rows[0] ?? {};
    return {
      soldTodayCount: int(row.soldTodayCount),
      todayNet: num(row.todayNet),
      currency: row.currency ? String(row.currency) : 'ETB',
    };
  }

  /** The drawer's Sales block for one branch. */
  async detailFor(branchId: number, now: Date = new Date()) {
    const cal = addisCalendar(now);
    // Minutes to add to a stored value to read it on the Addis clock: zero
    // when the process itself runs on Addis time.
    const toAddisMinutes = 180 + now.getTimezoneOffset();

    const between = (from: string, to: string) =>
      `c."occurredAt" >= ${from} AND c."occurredAt" < ${to}`;
    const figure = (alias: string, range: string) => `
      COALESCE(SUM(${SIGNED}) FILTER (WHERE ${range}), 0) AS "${alias}Net",
      COUNT(*) FILTER (WHERE ${range} AND ${IS_SALE}) AS "${alias}Count"`;

    const [totalsRows, dailyRows, tenderRows, edgeRows]: Array<
      Array<Record<string, unknown>>
    > = await Promise.all([
      this.dataSource.query(
        `SELECT ${figure('today', between('$3', '$4'))},
                ${figure('yesterday', between('$5', '$3'))},
                ${figure('month', between('$6', '$4'))},
                ${figure('lastMonth', between('$2', '$6'))},
                ${figure('lastMonthToDate', between('$2', '$7'))},
                MAX(c.currency) AS "currency"
           FROM pos_checkouts c
          WHERE c."branchId" = $1 AND ${STANDS} AND ${between('$2', '$4')}`,
        [
          branchId,
          cal.lastMonthStart,
          cal.dayStart,
          cal.tomorrowStart,
          cal.yesterdayStart,
          cal.monthStart,
          cal.lastMonthSamePoint,
        ],
      ),
      this.dataSource.query(
        `SELECT to_char(c."occurredAt" + ($4::int * interval '1 minute'), 'YYYY-MM-DD') AS "date",
                COALESCE(SUM(${SIGNED}), 0) AS "net",
                COUNT(*) FILTER (WHERE ${IS_SALE}) AS "count"
           FROM pos_checkouts c
          WHERE c."branchId" = $1 AND ${STANDS} AND ${between('$2', '$3')}
          GROUP BY 1`,
        [branchId, cal.thirtyDaysStart, cal.tomorrowStart, toAddisMinutes],
      ),
      // What customers paid with this month, sales only. Cash is reported as
      // handed over, so the change given back is taken off it afterwards.
      this.dataSource.query(
        `SELECT UPPER(COALESCE(NULLIF(TRIM(t->>'method'), ''), 'OTHER')) AS "method",
                SUM(CASE WHEN (t->>'amount') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                         THEN (t->>'amount')::numeric ELSE 0 END) AS "amount",
                COUNT(DISTINCT c.id) AS "count"
           FROM pos_checkouts c
          CROSS JOIN LATERAL jsonb_array_elements(
                  CASE WHEN jsonb_typeof(c.tenders) = 'array' THEN c.tenders ELSE '[]'::jsonb END
                ) t
          WHERE c."branchId" = $1 AND ${STANDS} AND ${IS_SALE} AND ${between('$2', '$3')}
          GROUP BY 1`,
        [branchId, cal.monthStart, cal.tomorrowStart],
      ),
      this.dataSource.query(
        `SELECT MIN(c."occurredAt") AS "firstSaleAt",
                MAX(c."occurredAt") AS "lastSaleAt",
                COALESCE(SUM(c."changeDue") FILTER (WHERE c."occurredAt" >= $2), 0) AS "monthChange"
           FROM pos_checkouts c
          WHERE c."branchId" = $1 AND ${STANDS} AND ${IS_SALE} AND c."occurredAt" < $3`,
        [branchId, cal.monthStart, cal.tomorrowStart],
      ),
    ]);

    const totals = totalsRows[0] ?? {};
    const edges = edgeRows[0] ?? {};
    const pick = (alias: string): SalesFigure => ({
      net: num(totals[`${alias}Net`]),
      count: int(totals[`${alias}Count`]),
    });

    const byDate = new Map(dailyRows.map((row) => [String(row.date), row]));
    const daily = cal.thirtyDayKeys.map((date) => ({
      date,
      net: num(byDate.get(date)?.net),
      count: int(byDate.get(date)?.count),
    }));

    const monthChange = num(edges.monthChange);
    const tenders = tenderRows
      .map((row) => {
        const method = String(row.method);
        const amount = num(row.amount);
        return {
          method,
          amount: method === 'CASH' ? num(amount - monthChange) : amount,
          count: int(row.count),
        };
      })
      .filter((row) => row.amount !== 0 || row.count > 0)
      .sort((a, b) => b.amount - a.amount);

    return {
      branchId,
      currency: totals.currency ? String(totals.currency) : 'ETB',
      timezone: 'Africa/Addis_Ababa',
      generatedAt: now,
      today: pick('today'),
      yesterday: pick('yesterday'),
      month: pick('month'),
      lastMonth: pick('lastMonth'),
      lastMonthToDate: pick('lastMonthToDate'),
      daily,
      tenders,
      firstSaleAt: dateOrNull(edges.firstSaleAt),
      lastSaleAt: dateOrNull(edges.lastSaleAt),
    };
  }

  private scopeWhere(scope: BranchListScope, params: unknown[]): string[] {
    const where: string[] = [];
    if (scope.search) {
      params.push(`%${scope.search}%`);
      where.push(`b.name ILIKE $${params.length}`);
    }
    if (scope.serviceFormat) {
      params.push(scope.serviceFormat);
      where.push(`b."serviceFormat"::text = $${params.length}`);
    }
    if (scope.isActive !== undefined) {
      params.push(scope.isActive);
      where.push(`b."isActive" = $${params.length}`);
    }
    return where;
  }
}
