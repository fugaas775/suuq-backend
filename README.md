## Suuq Backend

NestJS + TypeORM API powering the Suuq marketplace (customers, vendors, deliverers, and admin back-office). This doc covers local setup, configuration, migrations/seeds, observability, and deployment pointers.

### Stack

- Node.js 20+, NestJS 11, TypeORM, PostgreSQL, Redis (optional for rate limiting/cache), S3-compatible storage, Jest.

## Prerequisites

- Node.js 20+ (pin provided via `.nvmrc`), Yarn (Berry not required), PostgreSQL, and optional Redis for throttling/cache/idempotency consistency across instances.

## Quick start (local)

```bash
yarn install
cp .env.example .env   # if you keep one; otherwise create from sample below
yarn start:dev          # runs on http://localhost:3000 by default
```

### Sample .env

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database (prefer DATABASE_URL in CI)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/suuq
# or discrete vars:
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=suuq

# CORS / origins
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Redis (optional but recommended for throttling/cache/idempotency)
REDIS_URL=redis://localhost:6379

# Security / observability
SENTRY_DSN=
SENTRY_ENVIRONMENT=development

# Performance + networking
THROTTLE_TTL=60000
THROTTLE_LIMIT=180
KEEP_ALIVE_TIMEOUT_MS=65000
HEADERS_TIMEOUT_MS=66000
REQUEST_TIMEOUT_MS=0
SOCKET_TIMEOUT_MS=0

# API surface toggles
SWAGGER_ENABLED=false
METRICS_ENABLED=false
ENABLE_NODE_COMPRESSION=false
AUTO_MIGRATE=true

# Idempotency cache window (seconds)
IDEMPOTENCY_TTL_SEC=600
```

## Running

- `yarn start:dev` – watch mode
- `yarn start` – run compiled output
- `yarn start:prod` – production mode with `NODE_ENV=production`

## Build, lint, format

- `yarn build`
- `yarn lint`
- `yarn format`

## Database

- Config in `src/data-source.ts` (supports `DATABASE_URL` or discrete `DB_*`).
- Pool tuning: `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECT_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, `DB_SLOW_MS`.

### Migrations

- Run: `yarn typeorm migration:run`
- Generate: `yarn typeorm migration:generate -n <Name>`
- Auto-run at boot is **off** in production by default; set `AUTO_MIGRATE=true` only when you accept startup migrations.

### Seeds (common)

- `yarn seed:admin` / `yarn seed:admin:reset`
- `yarn seed:user:create` / `yarn seed:user:reset`
- `yarn seed:countries`
- `yarn seed:categories`
- `yarn seed:products`

## Tests

- Unit: `yarn test`
- Watch: `yarn test:watch`
- Coverage: `yarn test:cov`
- E2E: `yarn test:e2e` (uses `test/jest-e2e.json`)

## Observability, safety, and rollout

- **Health**: `/api/health`, `/api/health/ready`, `/status`, `/pdown`.
- **Metrics**: `/metrics` (enable with `METRICS_ENABLED=true`; protect at the edge).
- **Rate limiting**: global throttler; consistent limits across instances when `REDIS_URL` (or `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD`) is set. Configure `THROTTLE_TTL` and `THROTTLE_LIMIT`.
- **Idempotency**: `Idempotency-Key` header on write endpoints caches successful 2xx responses for `IDEMPOTENCY_TTL_SEC` (default 600s).
- **Caching & ETags**: selective Redis cache via `CacheInterceptor`; ETag interceptor enabled for hot GETs.
- **Feature flags**: `FEATURE_<FLAG>_ENABLED=true`, optional `FEATURE_<FLAG>_MIN_VERSION`, `FEATURE_<FLAG>_PCT` for percentage rollout. Client should send `X-App-Version` (and optionally `X-Device-Id`) for deterministic bucketing. Use `@RequireFeature('<FLAG>')` + `FeatureFlagGuard` or `FeatureFlagsService` in code.
- **Security headers**: Helmet enabled; CSP tuned for Swagger; CORS via `ALLOWED_ORIGINS` (comma-separated). `TRUST_PROXY=1` recommended behind a reverse proxy.
- **Sentry**: set `SENTRY_DSN` (+ optional `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_PROFILES_SAMPLE_RATE`); PII scrubbing applied before send.

## Deployment tips

- Build: `yarn build` (outputs to `dist/`).
- Run: `yarn start:prod` or `pm2 start ecosystem.production.config.js --env production`.
- Ensure `ALLOWED_ORIGINS`, database/Redis envs, and secrets are configured on the server.
- Consider terminating gzip at the proxy; set `ENABLE_NODE_COMPRESSION=true` only when needed.

## Notes for admin/back-office

- Admin endpoints sit under `/api/admin`; responses are marked `Cache-Control: no-store` by default to avoid stale dashboards.
- Legacy `/product-requests` paths are auto-prefixed to `/api/product-requests` for backwards compatibility.

## License

UNLICENSED (private).

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
