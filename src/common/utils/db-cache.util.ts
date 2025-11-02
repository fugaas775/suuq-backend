import { SelectQueryBuilder } from 'typeorm';

/**
 * Apply TypeORM query result cache to a QueryBuilder when enabled via env.
 * Uses TYPEORM_QUERY_CACHE_ENABLED/TYPEORM_CACHE_ENABLED and TTL envs.
 */
export function qbCacheIfEnabled<T>(qb: SelectQueryBuilder<T>, id: string): SelectQueryBuilder<T> {
  try {
    const on = (process.env.TYPEORM_QUERY_CACHE_ENABLED || process.env.TYPEORM_CACHE_ENABLED || 'false')
      .toString()
      .toLowerCase() === 'true';
    if (!on) return qb;
    const ttl = parseInt(
      process.env.TYPEORM_QUERY_CACHE_TTL_MS || process.env.TYPEORM_CACHE_TTL_MS || '30000',
      10,
    );
    return qb.cache(id, ttl);
  } catch {
    return qb;
  }
}

/** Returns TTL in ms for repository .find({ cache }) calls when enabled, or undefined. */
export function repoCacheTTL(): number | undefined {
  try {
    const on = (process.env.TYPEORM_QUERY_CACHE_ENABLED || process.env.TYPEORM_CACHE_ENABLED || 'false')
      .toString()
      .toLowerCase() === 'true';
    if (!on) return undefined;
    return (
      parseInt(process.env.TYPEORM_QUERY_CACHE_TTL_MS || process.env.TYPEORM_CACHE_TTL_MS || '30000', 10) ||
      undefined
    );
  } catch {
    return undefined;
  }
}
