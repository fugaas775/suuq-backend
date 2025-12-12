# Performance Tuning Playbook

This document captures the key runtime and code settings to reduce P95 latency, avoid connection timeouts, and improve resilience for this NestJS service.

## Node/NestJS settings

- Disable Node gzip in production (offload to Nginx):
  - main.ts respects `ENABLE_NODE_COMPRESSION=true` to opt-in; default off in production.
- Reduce production logging CPU:
  - Body logging disabled by default in production; keep `LOG_SAMPLE_N` high under load (e.g., `10` or `20`).
- Use all CPU cores:
  - PM2 `instances: 'max'` in `ecosystem.production.config.js`.
- Trust reverse proxy and tune HTTP timeouts:
  - `TRUST_PROXY=1` to honor `X-Forwarded-*` headers from Nginx/ALB.
  - `KEEP_ALIVE_TIMEOUT_MS` (default 65000) and `HEADERS_TIMEOUT_MS` (default 66000) are set on the Node HTTP server to harmonize with proxy timeouts and reduce socket churn.
  - `REQUEST_TIMEOUT_MS` and `SOCKET_TIMEOUT_MS` default to `0` (disabled) so the proxy controls request timeouts.

## Database (Postgres/TypeORM)

- Connection pooling via env in `src/data-source.ts`:
  - `DB_POOL_MAX=20..30`
  - `DB_CONNECT_TIMEOUT_MS=5000`
  - `DB_STATEMENT_TIMEOUT_MS=10000..15000`
- Consider PgBouncer in transaction mode for bursty workloads.
- Index search fields:
  - Migration added to enable `pg_trgm` and GIN index on `product.name`.
  - User directory filtering scalability: add composite & GIN indexes for new admin filters.
    - Composite (activity + verification) for common dashboard queries:
      ```sql
      CREATE INDEX IF NOT EXISTS idx_users_active_verification ON "user" ("isActive", "verificationStatus");
      ```
    - Role containment (array field) benefits from a GIN index:
      ```sql
      CREATE INDEX IF NOT EXISTS idx_users_roles_gin ON "user" USING GIN (roles);
      ```
    - Optional additional index for frequent recent-user sorts combined with activity:
      ```sql
      CREATE INDEX IF NOT EXISTS idx_users_active_created_at ON "user" ("isActive", "createdAt" DESC);
      ```
    - If email substring searches dominate and become slow at scale, enable `pg_trgm` and create an index:
      ```sql
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE INDEX IF NOT EXISTS idx_users_email_trgm ON "user" USING GIN (email gin_trgm_ops);
      ```
    - Verification documents presence checks (`jsonb_array_length`) rely on a sequential scan today; consider a partial index for docs presence:
      ```sql
      CREATE INDEX IF NOT EXISTS idx_users_has_docs ON "user" ((jsonb_array_length(COALESCE("verificationDocuments", '[]'::jsonb)))) WHERE jsonb_array_length(COALESCE("verificationDocuments", '[]'::jsonb)) > 0;
      ```
- Optional query result caching (TypeORM):
  - Enable with `TYPEORM_CACHE_ENABLED=true` (or `TYPEORM_QUERY_CACHE_ENABLED=true`).
  - TTL via `TYPEORM_CACHE_TTL_MS` (or `TYPEORM_QUERY_CACHE_TTL_MS`), default 30000.
  - Uses Redis when `REDIS_URL` is set; otherwise uses database-backed cache table.
  - We apply selective `.cache(...)` for hot, deterministic queries (e.g., categories roots, findManyByIds).

## Caching

- Introduce Redis-backed caching for hot GET endpoints (listings/home/analytics).
  - Use `@nestjs/cache-manager` + Redis store; apply `CacheInterceptor` selectively.
  - ETag-based conditional responses are enabled globally and on hotspots (categories tree, products list, home feed, East Africa batch) to return 304 when unchanged.

## Nginx/Load Balancer

- TLS + gzip termination at Nginx; enable upstream keepalive to Node workers:
  - `keepalive 64;`
  - `proxy_connect_timeout 2s; proxy_read_timeout 30s; proxy_send_timeout 30s;`
  - `proxy_next_upstream error timeout http_502 http_503 http_504;`
- Health-check endpoints (e.g., `/api/health`) to drain slow or starting instances during deploys.

## Deploy and observe

- Use PM2 `listen_timeout: 5000`, `kill_timeout: 5000` for graceful reloads.
- Monitor Postgres slow query log and app logs for pool exhaustion or long tails.

## Environment quick reference

- ENABLE_NODE_COMPRESSION=true|false (default false on production)
- TRUST_PROXY=1 (recommended behind Nginx/ALB)
- KEEP_ALIVE_TIMEOUT_MS=65000
- HEADERS_TIMEOUT_MS=66000
- REQUEST_TIMEOUT_MS=0
- SOCKET_TIMEOUT_MS=0
