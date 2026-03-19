## Suuq Backend

NestJS + TypeORM API powering the Suuq marketplace (customers, vendors, deliverers, and admin back-office). This doc covers local setup, configuration, migrations/seeds, observability, and deployment pointers.

## Retail OS Roadmap

### Phase 1: Backend Foundation for Retail OS

Status: complete

Delivered backend scope:

- tenant-scoped retail monetization using subscriptions and module entitlements
- entitlement enforcement for monetized retail automation flows
- alias-aware POS ingest, failed-entry replay, and remediation support
- inventory-ledger-triggered replenishment from transfers, POS sync, and manual adjustments
- replenishment policy controls stored in entitlement metadata
- safe auto-submit through the purchase-order lifecycle service with audit and inventory projection preservation
- retail ops APIs for stock health and replenishment draft review
- admin and retail filtering for auto-replenishment review, including blocked-reason summaries
- manual re-evaluation of blocked auto-replenishment drafts
- surface-specific action hints and explicit re-evaluation outcome contracts on retail, admin, and hub purchase-order endpoints

Validation completed:

- focused unit coverage across replenishment, purchase-order lifecycle, retail ops, and admin B2B flows
- e2e coverage for retail and admin re-evaluate replenishment endpoints
- clean production build via `yarn build`

### Phase 2: Next Retail OS Expansion

Status: in progress

Current focus:

- build the next monetized supermarket operations slice on top of the Phase 1 replenishment foundation
- expand `POS_CORE` from plan metadata into real retail ops contracts for branch sales throughput, payment recovery, and fulfillment backlog monitoring
- keep new automation features tenant-scoped and policy-driven rather than introducing branch-local feature flags

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

# Ebirr checkout routing (Kaafi/Coopay)
EBIRR_BASE_URL=https://payments.ebirr.com/asm
EBIRR_API_KEY=
EBIRR_MERCHANT_ID=
EBIRR_API_USER_ID=
EBIRR_CUSTOMER_PREFIX=231438
# Optional override when provider asks for a non-default method token
EBIRR_PAYMENT_METHOD=MWALLET_ACCOUNT

# StarPay gateway
STARPAY_MERCHANT_NAME=
STARPAY_MERCHANT_ID=
STARPAY_SECRET_KEY=
STARPAY_BASE_URL=https://starpayqa.starpayethiopia.com/v1/starpay-api
STARPAY_TIMEOUT_MS=30000
# StarPay QA/prod gateway uses x-api-secret style auth
STARPAY_AUTH_MODE=x-api-key
STARPAY_AUTH_SCHEME=Bearer
STARPAY_SECRET_HEADER_NAME=x-api-secret
STARPAY_MERCHANT_ID_HEADER_NAME=x-merchant-id
STARPAY_MERCHANT_NAME_HEADER_NAME=x-merchant-name
CALLBACK_SECRET=
STARPAY_SIGNATURE_HEADER_NAME=x-signature
STARPAY_TIMESTAMP_HEADER_NAME=x-timestamp
STARPAY_VERIFY_PAYMENT_PATH=/trdp/verify

# Optional: point the backend at an official SDK package instead of the built-in REST client.
# When set, the exported SDK client must implement:
# initiateBankPayment, initiateWalletPayment, generateDynamicQR,
# createService, createBill, getEodReport, getBalanceHistory, getSettlementTransactions
STARPAY_SDK_MODULE=
STARPAY_SDK_EXPORT_NAME=default

# All overrides are normalized under /v1/starpay-api/trdp/... to match portal docs.
# These defaults already resolve to:
#   https://.../v1/starpay-api/trdp/verify
#   https://.../v1/starpay-api/trdp/bank/initiate
STARPAY_BANK_PAYMENT_PATH=/trdp/bank/initiate
STARPAY_WALLET_PAYMENT_PATH=/trdp/wallet/initiate
STARPAY_DYNAMIC_QR_PATH=/trdp/qr/dynamic
STARPAY_CREATE_SERVICE_PATH=/trdp/billing/services
STARPAY_CREATE_BILL_PATH=/trdp/billing/bills
STARPAY_EOD_REPORT_PATH=/trdp/reports/eod
STARPAY_BALANCE_HISTORY_PATH=/trdp/accounts/e-money/balance-history
STARPAY_SETTLEMENTS_PATH=/trdp/settlements

### StarPay webhook replay

- Replay a signed callback locally with `scripts/test-starpay-webhook.sh 417`
- The script signs the DTO-normalized JSON payload shape used by the Nest validation pipeline.
- Default callback path: `/api/callbacks/starpay/webhook`
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
  - Core HTTP series: `http_requests_total`, `http_requests_by_status_class_total`, `http_requests_failed_total`, `http_request_duration_seconds`.
  - Route labels are normalized to reduce cardinality (template paths where available, dynamic IDs collapsed to `:id`).
  - Prometheus alert examples: `ops/monitoring/prometheus-alerts.yml`.
- **Rate limiting**: global throttler; consistent limits across instances when `REDIS_URL` (or `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD`) is set. Configure `THROTTLE_TTL` and `THROTTLE_LIMIT`.
- **Idempotency**: `Idempotency-Key` header on write endpoints caches successful 2xx responses for `IDEMPOTENCY_TTL_SEC` (default 600s).
- **Caching & ETags**: selective Redis cache via `CacheInterceptor`; ETag interceptor enabled for hot GETs.
- **Feature flags**: `FEATURE_<FLAG>_ENABLED=true`, optional `FEATURE_<FLAG>_MIN_VERSION`, `FEATURE_<FLAG>_PCT` for percentage rollout. Client should send `X-App-Version` (and optionally `X-Device-Id`) for deterministic bucketing. Use `@RequireFeature('<FLAG>')` + `FeatureFlagGuard` or `FeatureFlagsService` in code.
- **App update policy**: client should send `X-App-Version`, `X-App-Build`, and `X-Platform`. `GET /api/settings/app-versions` returns per-platform policy shaped as `{ ios: { min_version, latest_version, min_build, latest_build, force_update, store_url, message }, android: { ... } }`. The server also enforces this policy and responds with HTTP `426` when the app is below the minimum supported version/build or when `force_update=true` and the client is below the latest forced target.
- **Security headers**: Helmet enabled; CSP tuned for Swagger; CORS via `ALLOWED_ORIGINS` (comma-separated). `TRUST_PROXY=1` recommended behind a reverse proxy.
- **Sentry**: set `SENTRY_DSN` (+ optional `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_PROFILES_SAMPLE_RATE`); PII scrubbing applied before send.

## Deployment tips

- Build: `yarn build` (outputs to `dist/`).
- Run: `yarn start:prod` or `pm2 start ecosystem.production.config.js --env production`.
- Ensure `ALLOWED_ORIGINS`, database/Redis envs, and secrets are configured on the server.
- Consider terminating gzip at the proxy; set `ENABLE_NODE_COMPRESSION=true` only when needed.

## Deep links (Backend ownership)

Backend now exposes app-link association payloads at:

- `GET /api/linking/apple-app-site-association`
- `GET /api/linking/assetlinks.json`
- `GET /api/linking/product-share-landing?id=<productId>` (attempt app open, then store fallback)
- `GET /api/linking/request-share-landing?id=<requestId>` (attempt app open, then store fallback)

Use edge/proxy (see `ops/nginx/frontend-proxy-api.conf.example`) to map these to your primary domain root paths:

- `/apple-app-site-association`
- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

Required env vars:

- `IOS_APP_ID` (preferred, format: `TEAMID.bundle.id`) or both `IOS_TEAM_ID` + `IOS_BUNDLE_ID`
- `IOS_ASSOCIATED_PATHS` (optional CSV, default: `/product-detail*`)
- `ANDROID_PACKAGE_NAME`
- `ANDROID_SHA256_FINGERPRINTS` (CSV of signing cert SHA-256 fingerprints)
- `APP_SCHEME` (optional, default: `suuq://`)
- `APP_STORE_URL_IOS` / `IOS_STORE_URL` (optional, default: `https://apps.apple.com/`)
- `APP_STORE_URL_ANDROID` / `ANDROID_STORE_URL` (optional; if unset, Play link is generated from `ANDROID_PACKAGE_NAME`)

Flutter share integration should use landing URLs like:

- `https://api.suuq.ugasfuad.com/api/linking/product-share-landing?id=123`
- or (recommended) `https://suuq.ugasfuad.com/l/product?id=123` after applying the Nginx mapping in `ops/nginx/frontend-proxy-api.conf.example`
- shortest format: `https://suuq.ugasfuad.com/s/p/123`

Request-share URLs follow the same pattern:

- `https://api.suuq.ugasfuad.com/api/linking/request-share-landing?id=123`
- or `https://suuq.ugasfuad.com/l/request?id=123`
- shortest format: `https://suuq.ugasfuad.com/s/r/123`

This removes Dynamic Links dependency for install fallback behavior.

## Notes for admin/back-office

- Admin endpoints sit under `/api/admin`; responses are marked `Cache-Control: no-store` by default to avoid stale dashboards.
- Legacy `/product-requests` paths are auto-prefixed to `/api/product-requests` for backwards compatibility.

## Payments contract: Boost methods (Flutter)

Endpoint: `GET /api/payments/boost-methods`

- Purpose: return boost-capable payment providers for the user country.
- Country resolution order:
  1.  Query param `country`
  2.  Headers: `x-user-country`, `x-country`, `cf-ipcountry`, `x-vercel-ip-country`, `x-country-code`
- Supports both ISO and names (examples: `ET` / `Ethiopia`) and normalizes to ISO code.

### Response schema (exact)

```ts
type BoostMethodsResponse = {
  country: string | null;
  methods: Array<{
    id:
      | 'STARPAY'
      | 'TELEBIRR'
      | 'EBIRR'
      | 'CBE'
      | 'MPESA'
      | 'WAAFI'
      | 'DMONEY'
      | 'BANK_TRANSFER';
    name: string;
    country: string; // single-country methods: 'ET' | 'KE' | ... ; multi-country methods: 'MULTI'
    countries: string[]; // e.g. ['ET'] or ['ALL']
    enabled: boolean; // backend-ready + env toggles applied
    supportsBoost: boolean; // true means eligible for boost UI
  }>;
};
```

### Example response

```json
{
  "country": "ET",
  "methods": [
    {
      "id": "TELEBIRR",
      "name": "Telebirr",
      "country": "ET",
      "countries": ["ET"],
      "enabled": false,
      "supportsBoost": true
    },
    {
      "id": "EBIRR",
      "name": "Ebirr",
      "country": "ET",
      "countries": ["ET"],
      "enabled": true,
      "supportsBoost": true
    }
  ]
}
```

Flutter integration rule: show only `methods.where((m) => m.enabled && m.supportsBoost)` and send selected `id` as `provider` to `POST /api/payments/initiate-boost`.

## Retail OS contracts

### Admin: list Retail OS plan presets

Endpoint: `GET /api/admin/retail-tenants/plan-presets`

- Purpose: give the admin provisioning UI a backend-owned catalog of plan bundles and default module metadata.
- Current presets:
  - `RETAIL_STARTER`
  - `RETAIL_AUTOMATION`
  - `RETAIL_INTELLIGENCE`
  - `RETAIL_ENTERPRISE`
- `RETAIL_INTELLIGENCE` and `RETAIL_ENTERPRISE` both bundle `AI_ANALYTICS`.
- `RETAIL_ENTERPRISE` also bundles `ACCOUNTING`.

### Admin: apply a Retail OS plan preset

Endpoint: `POST /api/admin/retail-tenants/:id/apply-plan-preset`

- Purpose: create the tenant subscription and apply the bundled module entitlements in one admin action.
- Notes:
  - defaults to the preset billing configuration when amount/currency/interval are omitted
  - defaults `startsAt` to now and `autoRenew` to `true`

Example request body:

```json
{
  "presetCode": "RETAIL_INTELLIGENCE"
}
```

### Admin: enable AI analytics entitlement

Endpoint: `PUT /api/admin/retail-tenants/:id/modules/AI_ANALYTICS`

- Purpose: enable the paid Retail OS AI analytics slice for a tenant.
- Guardrails: requires an active tenant subscription and module entitlement like the other Retail OS modules.
- Optional metadata: `aiAnalyticsPolicy`
  - `stalePurchaseOrderHours`: integer `1..720`; controls when open POs are treated as stale in the insight summary.
  - `targetHealthScore`: integer `1..100`; raises a health-target alert when the live branch score falls below this threshold.

Example request body:

```json
{
  "enabled": true,
  "reason": "Retail Pro Plus AI analytics add-on",
  "metadata": {
    "aiAnalyticsPolicy": {
      "stalePurchaseOrderHours": 48,
      "targetHealthScore": 90
    }
  }
}
```

### Branch ops: stock health

Endpoint: `GET /api/retail/v1/ops/stock-health?branchId=3&page=1&limit=20`

CSV export: `GET /api/retail/v1/ops/stock-health/export?branchId=3&page=1&limit=20`

- Entitlement required: `INVENTORY_CORE`
- Purpose: return a branch stock-health queue with inventory records ordered by urgency.
- Response includes:
  - inventory summary counts for healthy, low-stock, reorder-now, and out-of-stock SKUs
  - inbound open PO and committed-unit context
  - CSV export with one row per surfaced inventory record for spreadsheet-style stock triage and vendor follow-up
  - per-SKU inventory snapshots including available-to-sell, shortage to safety stock, and stock status

### Branch ops: network command center

Endpoint: `GET /api/retail/v1/ops/network-command-center?branchId=3&branchLimit=3&module=INVENTORY_CORE&status=CRITICAL&hasAlertsOnly=true&alertSeverity=CRITICAL`

CSV export: `GET /api/retail/v1/ops/network-command-center/export?branchId=3&branchLimit=3&module=INVENTORY_CORE&status=CRITICAL&hasAlertsOnly=true&alertSeverity=CRITICAL`

Report snapshot capture: `POST /api/retail/v1/ops/network-command-center/report-snapshots?branchId=3&branchLimit=3&module=INVENTORY_CORE&status=CRITICAL&hasAlertsOnly=true&alertSeverity=CRITICAL`

Latest saved snapshot: `GET /api/retail/v1/ops/network-command-center/report-snapshots/latest?branchId=3&branchLimit=3&module=INVENTORY_CORE&status=CRITICAL&hasAlertsOnly=true&alertSeverity=CRITICAL`

- Entitlement model: requires the branch to belong to an active Retail OS tenant with an active subscription; the response only includes modules that currently have an active entitlement on that tenant.
- Purpose: return a tenant-level HQ command center summary that rolls up the active Retail OS operational modules anchored to the requested branch.
- Response includes:
  - per-module cards for POS operations, inventory health, replenishment automation, AI operating risk, accounting, and desktop back office when those modules are entitled
  - optional `module`, `status=CRITICAL|HIGH|NORMAL`, `hasAlertsOnly=true|false`, and `alertSeverity=INFO|WATCH|CRITICAL` filters so HQ can isolate one module family, only the most urgent cards, or only cards with matching alert pressure
  - a normalized severity ladder (`CRITICAL|HIGH|NORMAL`) so HQ can rank cross-module pressure quickly
  - top alert rollups, key metrics, and branch previews that link operators back into the module-specific branch queues
  - per-module trend metadata including previous status, status delta, direction (`WORSENING|STABLE|IMPROVING`), previous alert count, and previous headline metric value when a saved report snapshot exists
  - direct actions to open each module's network summary or CSV export endpoint
  - CSV export with one row per module branch preview, repeating module-level status, alert, and metric summaries for spreadsheet triage
  - report snapshot capture for scheduled reporting workflows; snapshots are persisted as the comparison baseline used for future command-center trend fields
  - latest-snapshot retrieval for reporting clients that need to fetch the stored baseline directly rather than always reading the live view

Scheduled reporting:

- Backend cron support is available through `RetailCommandCenterReportingService`.
- Enable with `RETAIL_COMMAND_CENTER_SNAPSHOT_SCHEDULE_ENABLED=true`.
- Provide JSON targets via `RETAIL_COMMAND_CENTER_SNAPSHOT_TARGETS`, for example:

```json
[
  {
    "branchId": 3,
    "branchLimit": 3,
    "module": "INVENTORY_CORE",
    "status": "CRITICAL",
    "hasAlertsOnly": true,
    "alertSeverity": "CRITICAL"
  }
]
```

### Branch ops: POS operations

Endpoint: `GET /api/retail/v1/ops/pos-operations?branchId=3&windowHours=24&topItemsLimit=5`

CSV export: `GET /api/retail/v1/ops/pos-operations/export?branchId=3&windowHours=24&topItemsLimit=5`

- Entitlement model: requires `POS_CORE` on the anchor branch tenant.
- Purpose: return a branch POS operating snapshot covering sales throughput, payment recovery, open-order pressure, and the top-selling items in the selected window.
- Response includes:
  - order, payment, and fulfillment counters for the selected branch window
  - active branch staffing counts based on assigned retail operators and managers
  - alert cards for failed-payment recovery, fulfillment backlog, unpaid-order pressure, and idle sales windows
  - payment-method mix, status mix, and top-selling items ranked by gross sales
  - CSV export with one row per surfaced top item while repeating the branch-level POS summary for spreadsheet triage

### Branch ops: POS network summary

Endpoint: `GET /api/retail/v1/ops/pos-operations/network-summary?branchId=3&limit=10&windowHours=24&status=CRITICAL`

CSV export: `GET /api/retail/v1/ops/pos-operations/network-summary/export?branchId=3&limit=10&windowHours=24&status=CRITICAL`

- Entitlement model: requires `POS_CORE` on the anchor branch tenant.
- Purpose: return a tenant-level POS operations summary across active branches for sales throughput, payment recovery pressure, and aged open-order exposure.
- Response includes:
  - per-branch priority cards using the same `CRITICAL|HIGH|NORMAL` ladder used by the command center
  - aggregated order, sales, failed-payment, unpaid-order, and delayed-fulfillment counts for the selected window
  - tenant-level alerts for payment recovery, fulfillment backlog, and staffed-but-idle branches
  - direct actions that link HQ operators back into the branch POS operations snapshot
  - CSV export with one row per surfaced branch

### Branch ops: POS exception queue

Endpoint: `GET /api/retail/v1/ops/pos-operations/exceptions?branchId=3&limit=25&windowHours=24&queueType=FAILED_PAYMENT&priority=CRITICAL`

CSV export: `GET /api/retail/v1/ops/pos-operations/exceptions/export?branchId=3&limit=25&windowHours=24&queueType=FAILED_PAYMENT&priority=CRITICAL`

- Entitlement model: requires `POS_CORE` on the anchor branch tenant.
- Purpose: return actionable branch POS exceptions grouped into failed-payment recovery, payment-proof review, and delayed-fulfillment queues.
- Response includes:
  - optional `queueType=FAILED_PAYMENT|PAYMENT_REVIEW|FULFILLMENT_DELAY` and `priority=CRITICAL|HIGH|NORMAL` filters
  - summary counts for total exceptions, filtered exceptions, and each queue family in the selected window
  - one surfaced queue item per affected order using the highest-priority exception on that order
  - direct actions back into the retail POS order drilldown and existing admin payment or cancellation routes
  - CSV export with one row per surfaced exception while repeating the branch and summary context for spreadsheet triage

### Branch ops: POS exception network summary

Endpoint: `GET /api/retail/v1/ops/pos-operations/exceptions/network-summary?branchId=3&limit=10&windowHours=24&queueType=FAILED_PAYMENT&priority=CRITICAL`

CSV export: `GET /api/retail/v1/ops/pos-operations/exceptions/network-summary/export?branchId=3&limit=10&windowHours=24&queueType=FAILED_PAYMENT&priority=CRITICAL`

- Entitlement model: requires `POS_CORE` on the anchor branch tenant.
- Purpose: return a tenant-level POS exception rollup so HQ operators can prioritize branches with the highest payment-recovery or fulfillment-delay pressure.
- Response includes:
  - optional `queueType=FAILED_PAYMENT|PAYMENT_REVIEW|FULFILLMENT_DELAY` and `priority=CRITICAL|HIGH|NORMAL` filters applied across active tenant branches
  - per-branch exception cards with highest-priority classification, queue mix, oldest exception age, and branch action links
  - tenant summary totals for surfaced branches, exception counts, critical branches, and queue-family totals
  - network alerts for critical exception pressure, failed-payment recovery load, payment-review backlog, and fulfillment-delay exposure
  - CSV export with one row per surfaced branch

### Branch ops: POS order drilldown

Endpoint: `GET /api/retail/v1/ops/pos-operations/orders/18?branchId=3`

- Entitlement model: requires `POS_CORE` on the anchor branch tenant.
- Purpose: return order-level POS drilldown detail for an exception queue item.
- Response includes:
  - order status, payment state, payment-proof review state, and fulfillment timestamps
  - customer contact and shipping-city context for operator follow-up
  - line-item detail with quantity, unit price, and line total
  - action hints for payment-proof approval or rejection, bank-transfer approval, Ebirr status sync, and admin cancellation when those routes apply

### Branch ops: stock health network summary

Endpoint: `GET /api/retail/v1/ops/stock-health/network-summary?branchId=3&limit=10&stockStatus=OUT_OF_STOCK`

CSV export: `GET /api/retail/v1/ops/stock-health/network-summary/export?branchId=3&limit=10&stockStatus=OUT_OF_STOCK`

- Entitlement required: `INVENTORY_CORE`
- Purpose: return a tenant-level inventory health summary across the branches tied to the requested branch.
- Response includes:
  - optional `stockStatus=HEALTHY|LOW_STOCK|REORDER_NOW|OUT_OF_STOCK` filtering based on each branch's worst live stock status
  - tenant-wide totals for total SKUs, replenishment candidates, active stockouts, negative availability, inbound open PO units, and committed units
  - branch-level ranking by worst live stock status so HQ operators can open the riskiest branch stock queues first
  - network alerts for multi-branch stockout pressure, negative availability, and broader replenishment backlog
  - `VIEW_BRANCH_STOCK_HEALTH` actions for each surfaced branch

### Branch ops: AI insights

Endpoint: `GET /api/retail/v1/ops/ai-insights?branchId=3&limit=10`

CSV export: `GET /api/retail/v1/ops/ai-insights/export?branchId=3&limit=10`

- Entitlement required: `AI_ANALYTICS`
- Purpose: return a branch operating snapshot with a health score, action cards, and prioritized SKU risk recommendations.
- Signals used:
  - out-of-stock SKUs
  - below-safety-stock exposure
  - negative availability
  - inbound open PO coverage
  - stale open POs
  - blocked auto-replenishment drafts
  - CSV export with one row per surfaced product risk, plus branch health score and triggered insight codes for offline review

### Branch ops: AI network summary

Endpoint: `GET /api/retail/v1/ops/ai-insights/network-summary?branchId=3&limit=10&severity=CRITICAL`

CSV export: `GET /api/retail/v1/ops/ai-insights/network-summary/export?branchId=3&limit=10&severity=CRITICAL`

- Entitlement required: `AI_ANALYTICS`
- Purpose: return a tenant-level AI operating summary across the branches tied to the requested branch.
- Response includes:
  - optional `severity=INFO|WATCH|CRITICAL` filtering based on each branch's highest active AI insight severity
  - tenant-wide averages and totals for health score, at-risk SKUs, stockouts, negative availability, stale open POs, and blocked auto-submission drafts
  - branch-level ranking by highest active AI severity and then health score so HQ operators can open the weakest branches first
  - network alerts for multi-branch critical AI risk, automation blockers, and stale inbound degradation
  - `VIEW_BRANCH_AI_INSIGHTS` actions for each surfaced branch

### Branch ops: replenishment network summary

Endpoint: `GET /api/retail/v1/ops/replenishment-drafts/network-summary?branchId=3&supplierProfileId=14&autoReplenishmentSubmissionMode=AUTO_SUBMIT&autoReplenishmentBlockedReason=MINIMUM_ORDER_TOTAL_NOT_MET&limit=10`

CSV export: `GET /api/retail/v1/ops/replenishment-drafts/network-summary/export?branchId=3&supplierProfileId=14&autoReplenishmentSubmissionMode=AUTO_SUBMIT&autoReplenishmentBlockedReason=MINIMUM_ORDER_TOTAL_NOT_MET&limit=10`

- Entitlement required: `INVENTORY_AUTOMATION`
- Purpose: return a tenant-level replenishment automation summary across the branches tied to the requested branch.
- Response includes:
  - the same supplier, submission-mode, and blocked-reason pivots as the branch replenishment draft queue
  - tenant-wide totals for stale drafts, draft value, supplier concentration, blocked auto-submit drafts, and ready auto-submit drafts
  - branch-level ranking by replenishment automation urgency so HQ operators can open blocked branches before stale or normal queues
  - network alerts for blocked automation, stale draft buildup, and ready-to-submit automation backlog
  - `VIEW_BRANCH_REPLENISHMENT_DRAFTS` actions for each surfaced branch

Response shape:

```ts
type RetailAiInsightsResponse = {
  summary: {
    branchId: number;
    generatedAt: string;
    healthScore: number;
    totalSkus: number;
    atRiskSkus: number;
    outOfStockSkus: number;
    negativeAvailableSkus: number;
    inboundOpenPoUnits: number;
    openPurchaseOrderCount: number;
    openPurchaseOrderValue: number;
    staleOpenPurchaseOrderCount: number;
    blockedAutoSubmitDraftCount: number;
  };
  insights: Array<{
    code: string;
    severity: 'INFO' | 'WATCH' | 'CRITICAL';
    title: string;
    summary: string;
    metric?: number | null;
    action?: string | null;
  }>;
  productRisks: Array<{
    productId: number;
    stockStatus: 'HEALTHY' | 'LOW_STOCK' | 'REORDER_NOW' | 'OUT_OF_STOCK';
    availableToSell: number;
    safetyStock: number;
    inboundOpenPo: number;
    shortageToSafetyStock: number;
    riskScore: number;
    recommendedReorderUnits: number;
    lastReceivedAt?: string | null;
    lastPurchaseOrderId?: number | null;
  }>;
};
```

### Branch ops: accounting overview

Endpoint: `GET /api/retail/v1/ops/accounting-overview?branchId=3&limit=20&accountingState=DISCREPANCY_REVIEW&supplierProfileId=14&slaBreachedOnly=true`

CSV export: `GET /api/retail/v1/ops/accounting-overview/export?branchId=3&limit=20&accountingState=DISCREPANCY_REVIEW&priority=CRITICAL&supplierProfileId=14&slaBreachedOnly=true`

- Entitlement required: `ACCOUNTING`
- Purpose: return the branch accounting work queue for purchase-order commitments, receipt discrepancies, and reconciliation readiness.
- Optional filters:
  - `accountingState`
  - `priority`
  - `supplierProfileId`
  - `slaBreachedOnly`
- Response includes:
  - summary counts and values for open commitments
  - received orders pending reconciliation
  - discrepancy review and approval queues
  - priority counts for critical, high, and normal accounting work
  - CSV export with one row per surfaced purchase-order queue item for downstream accounting handoff and audit trails
  - per-order `priority` and `priorityReason` fields for triage
  - per-purchase-order actions such as `VIEW_RECEIPT_EVENTS`, `APPROVE_DISCREPANCY`, and `MARK_RECONCILED`

### Branch ops: accounting network summary

Endpoint: `GET /api/retail/v1/ops/accounting-overview/network-summary?branchId=3&limit=10&priority=CRITICAL&accountingState=DISCREPANCY_REVIEW`

CSV export: `GET /api/retail/v1/ops/accounting-overview/network-summary/export?branchId=3&limit=10&priority=CRITICAL&accountingState=DISCREPANCY_REVIEW`

- Entitlement required: `ACCOUNTING`
- Purpose: return a tenant-level accounting summary across the branches tied to the requested branch.
- Response includes:
  - optional `accountingState` filtering so HQ can isolate discrepancy review, open commitments, or reconciliation-specific branch queues
  - optional `priority=CRITICAL|HIGH|NORMAL` branch filtering for HQ triage
  - CSV export with one row per surfaced branch so HQ accounting teams can hand off queue state to downstream finance workflows
  - tenant-wide totals for open commitments, discrepancy review, approved discrepancies, and reconcile-ready work
  - aggregate accounting priority queue counts across tenant branches
  - branch-level ranking by highest accounting priority so HQ operators can open the riskiest branch accounting queues first
  - network alerts for discrepancy review risk and concentrated open-commitment exposure
  - `VIEW_BRANCH_ACCOUNTING_OVERVIEW` actions for each surfaced branch

### Branch ops: accounting payout exceptions

Endpoint: `GET /api/retail/v1/ops/accounting-overview/payout-exceptions?branchId=3&limit=25&windowHours=168&exceptionType=AUTO_RETRY_REQUIRED&priority=CRITICAL`

CSV export: `GET /api/retail/v1/ops/accounting-overview/payout-exceptions/export?branchId=3&limit=25&windowHours=168&exceptionType=AUTO_RETRY_REQUIRED&priority=CRITICAL`

- Entitlement required: `ACCOUNTING`
- Purpose: return a branch finance queue for failed auto vendor payouts and payout-debit reconciliation exceptions linked back to fulfilled branch orders.
- Optional filters:
  - `limit`
  - `windowHours`
  - `exceptionType=AUTO_RETRY_REQUIRED|RECONCILIATION_REQUIRED`
  - `priority=CRITICAL|HIGH|NORMAL`
- Response includes:
  - summary counts for failed auto retries, reconciliation-required payout debits, priority levels, and amount at risk
  - payout-level rows with vendor contact, order linkage, payout status, failure reason, and priority reason
  - action hints to the existing admin wallet retry and reconcile endpoints plus the retail POS order drilldown
  - CSV export with one row per surfaced payout exception for finance handoff and spreadsheet recovery workflows

### Branch ops: accounting payout exception network summary

Endpoint: `GET /api/retail/v1/ops/accounting-overview/payout-exceptions/network-summary?branchId=3&limit=10&windowHours=168&exceptionType=AUTO_RETRY_REQUIRED&priority=CRITICAL`

CSV export: `GET /api/retail/v1/ops/accounting-overview/payout-exceptions/network-summary/export?branchId=3&limit=10&windowHours=168&exceptionType=AUTO_RETRY_REQUIRED&priority=CRITICAL`

- Entitlement required: `ACCOUNTING`
- Purpose: return a tenant-level payout-exception rollup so HQ finance teams can rank branches by payout recovery pressure.
- Response includes:
  - optional `exceptionType` filtering so HQ can isolate failed auto retries versus reconciliation-required payout debits
  - optional `priority=CRITICAL|HIGH|NORMAL` branch filtering for finance triage
  - tenant totals for payout exception counts, amount at risk, and priority queue mix across surfaced branches
  - branch-level cards with highest priority, queue counts, oldest exception age, and `VIEW_BRANCH_ACCOUNTING_PAYOUT_EXCEPTIONS` actions
  - network alerts for critical payout recovery pressure, failed auto payout backlog, and wallet-debit reconciliation backlog
  - CSV export with one row per surfaced branch

### Branch ops: desktop workbench

Endpoint: `GET /api/retail/v1/ops/desktop-workbench?branchId=3&limit=10&windowHours=72&queueType=SYNC_QUEUE&priority=CRITICAL`

CSV export: `GET /api/retail/v1/ops/desktop-workbench/export?branchId=3&limit=10&windowHours=72&queueType=SYNC_QUEUE&priority=CRITICAL`

- Entitlement required: `DESKTOP_BACKOFFICE`
- Purpose: return a branch desktop operations workbench combining POS sync failures, pending branch transfers, and inventory adjustment exceptions.
- Optional filters:
  - `limit`
  - `windowHours`
  - `queueType=SYNC_QUEUE|TRANSFER_QUEUE|STOCK_EXCEPTIONS`
  - `priority=CRITICAL|HIGH|NORMAL`
- Response includes:
  - summary counts for failed/open POS sync jobs, rejected sync entries, pending transfers, and negative adjustments
  - `alerts[]` for stale inbound transfer backlog, sync failures, and inventory drift
  - CSV export with normalized rows across sync jobs, transfers, and stock exceptions so branch desktop teams can sort and share queue state externally
  - `syncQueue[]` with `VIEW_SYNC_JOB` actions
  - `transferQueue[]` with `VIEW_TRANSFER` actions
  - `stockExceptions[]` with `VIEW_STOCK_MOVEMENTS` actions

### Branch ops: desktop network summary

Endpoint: `GET /api/retail/v1/ops/desktop-workbench/network-summary?branchId=3&limit=10&windowHours=72&queueType=STOCK_EXCEPTIONS&priority=HIGH`

CSV export: `GET /api/retail/v1/ops/desktop-workbench/network-summary/export?branchId=3&limit=10&windowHours=72&queueType=STOCK_EXCEPTIONS&priority=HIGH`

- Entitlement required: `DESKTOP_BACKOFFICE`
- Purpose: return a tenant-level desktop operations summary across the branches tied to the requested branch.
- Response includes:
  - optional `queueType=SYNC_QUEUE|TRANSFER_QUEUE|STOCK_EXCEPTIONS` filtering for HQ pivots by work family
  - optional `priority=CRITICAL|HIGH|NORMAL` branch filtering for HQ triage
  - CSV export with one row per surfaced branch so desktop operations teams can circulate queue state outside the app
  - tenant-wide totals for failed/open POS sync jobs, rejected sync entries, pending transfers, and negative inventory adjustments
  - branch-level ranking by highest desktop priority so HQ operators can open the riskiest branch workbenches first
  - network alerts for multi-branch sync failures, stale transfer backlog, and material adjustment drift
  - `VIEW_BRANCH_DESKTOP_WORKBENCH` actions for each surfaced branch

### Branch ops: desktop sync failed entries

Endpoint: `GET /api/retail/v1/ops/desktop-workbench/sync-jobs/401/failed-entries?branchId=3&limit=25&priority=CRITICAL&movementType=TRANSFER&transferOnly=true`

- Entitlement required: `DESKTOP_BACKOFFICE`
- Purpose: inspect failed POS sync entries for a branch job without leaving the retail desktop surface.
- Optional filters:
  - `priority=CRITICAL|HIGH|NORMAL`
  - `movementType`
  - `transferOnly=true`
- Response includes:
  - job summary (`syncType`, `status`, rejected vs failed-entry counts)
  - filtered triage counts for critical, high, normal, and transfer-linked failures
  - `items[]` with per-entry error details, desktop triage priority, and per-entry actions
  - actions for `VIEW_SYNC_JOB` and selective `REPLAY_SYNC_FAILURES`

### Branch ops: desktop transfer detail

Endpoint: `GET /api/retail/v1/ops/desktop-workbench/transfers/301?branchId=3&includeItems=true`

- Entitlement required: `DESKTOP_BACKOFFICE`
- Purpose: inspect a stale or pending branch transfer from the retail desktop surface.
- Response includes:
  - transfer summary (`direction`, `status`, `ageHours`, `priority`, timestamps)
  - actionable transitions such as `DISPATCH_TRANSFER`, `RECEIVE_TRANSFER`, and `CANCEL_TRANSFER` when applicable
  - role-aware action enablement based on platform roles or active branch-staff assignment on the requested branch
  - optional transfer line items when `includeItems` is not set to `false`

### Branch ops: desktop stock exception detail

Endpoint: `GET /api/retail/v1/ops/desktop-workbench/stock-exceptions/201?branchId=3`

- Entitlement required: `DESKTOP_BACKOFFICE`
- Purpose: inspect a stock adjustment exception from the retail desktop surface.
- Response includes:
  - stock movement summary (`productId`, `quantityDelta`, `sourceType`, `sourceReferenceId`, `priority`, `ageHours`)
  - actions for `VIEW_STOCK_MOVEMENTS`
  - source-aware actions such as `VIEW_TRANSFER_DETAIL` when the exception is linked to a branch transfer

Response shape:

```ts
type RetailAccountingOverviewResponse = {
  summary: {
    branchId: number;
    openCommitmentCount: number;
    openCommitmentValue: number;
    receivedPendingReconciliationCount: number;
    receivedPendingReconciliationValue: number;
    discrepancyOpenCount: number;
    discrepancyResolvedCount: number;
    discrepancyApprovedCount: number;
    reconcileReadyCount: number;
    oldestOpenCommitmentAgeHours: number;
    oldestReceivedPendingReconciliationAgeHours: number;
    supplierExposure: Array<{
      supplierProfileId: number;
      openCommitmentCount: number;
      openCommitmentValue: number;
      receivedPendingReconciliationCount: number;
      discrepancyOpenCount: number;
      shortageUnitCount: number;
      damagedUnitCount: number;
      shortageValue: number;
      damagedValue: number;
    }>;
    discrepancyOpenAgingBuckets: {
      under24Hours: number;
      between24And72Hours: number;
      over72Hours: number;
    };
    discrepancyAwaitingApprovalAgingBuckets: {
      under24Hours: number;
      between24And72Hours: number;
      over72Hours: number;
    };
  };
  alerts: Array<{
    code: string;
    severity: 'INFO' | 'WATCH' | 'CRITICAL';
    title: string;
    summary: string;
    metric: number | null;
    action: string | null;
  }>;
  items: Array<{
    purchaseOrderId: number;
    orderNumber: string;
    status: 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'SHIPPED' | 'RECEIVED';
    supplierProfileId: number;
    currency: string;
    total: number;
    outstandingUnitCount: number;
    shortageUnitCount: number;
    damagedUnitCount: number;
    orderAgeHours: number;
    accountingState:
      | 'OPEN_COMMITMENT'
      | 'RECEIVED_PENDING_RECONCILIATION'
      | 'DISCREPANCY_REVIEW'
      | 'DISCREPANCY_AWAITING_APPROVAL'
      | 'READY_TO_RECONCILE';
    lastDiscrepancyStatus: 'OPEN' | 'RESOLVED' | 'APPROVED' | null;
    lastReceiptEventId: number | null;
    lastReceiptEventAgeHours: number | null;
    actions: Array<{
      type: string;
      method: 'GET' | 'PATCH';
      path: string;
      body: Record<string, any> | null;
      enabled: boolean;
    }>;
  }>;
};
```

## Orders contract: Cart vs Buy Now (Flutter)

Endpoint: `POST /api/orders`

- `Add to Cart` flow: omit `items` (or use cart endpoints first), backend checks out current server cart.
- `Buy Now` flow: send `checkoutMode: "BUY_NOW"` and include `items` with the selected product(s).
- Safety rule: when `checkoutMode` is `BUY_NOW`, backend returns `400` if `items` is missing/empty to prevent accidental full-cart checkout.

Example Buy Now payload:

```json
{
  "checkoutMode": "BUY_NOW",
  "paymentMethod": "EBIRR",
  "phoneNumber": "2519XXXXXXXX",
  "shippingAddress": {
    "fullName": "Buyer",
    "address": "Bole",
    "city": "Addis Ababa",
    "country": "ET",
    "phoneNumber": "2519XXXXXXXX"
  },
  "items": [{ "productId": 435, "quantity": 1 }]
}
```

### Variant selection contract (Flutter)

For products with required listing/category variants, backend validates both cart add and order checkout payloads.

- Send selected variants in `attributes` as single-choice key/value pairs (for example `{ "size": "M", "color": "Black" }`).
- If product/category has no required variants, no variant fields are required.
- Internal metadata keys such as `offerId`, `offer_id`, `clientRef`, `client_ref`, `image_url` are ignored for variant validation and are not returned in order item attributes.

Validation errors you should normalize client-side:

- Cart (`POST /api/cart/items`):
  - Missing required: `Missing required product selections: <key1>, <key2>`
  - Invalid value/type: `Invalid required product selections: <key1>, <key2>`
- Checkout (`POST /api/orders`):
  - Missing required: `Missing required product selections for product <productId>: <key1>, <key2>`
  - Invalid value/type: `Invalid required product selections for product <productId>: <key1>, <key2>`

Order details response now includes selected attributes per item:

- `GET /api/orders`
- `GET /api/orders/:id`

Example item fragment:

```json
{
  "productId": 435,
  "quantity": 1,
  "price": 300,
  "attributes": {
    "size": "M",
    "color": "Black"
  }
}
```

### Expected decline contract (402)

For expected provider-side declines (for example during EBIRR checkout), backend returns:

- HTTP status: `402 Payment Required`
- `error.code`: `PAYMENT_DECLINED`
- `error.details.expectedDecline`: `true`
- `error.details.telemetryTag`: machine-friendly tag for filtering/analytics
- `error.details.providerCode`: upstream provider code (e.g. `5309`, `5310`)

Sample payload:

```json
{
  "error": {
    "code": "PAYMENT_DECLINED",
    "message": "Payment declined. Please verify SIM/account and retry or use another payment method.",
    "details": {
      "provider": "EBIRR",
      "providerCode": "5310",
      "providerRef": "Suuq_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "orderId": 352,
      "currency": "ETB",
      "amount": "300",
      "expectedDecline": true,
      "telemetryTag": "EBIRR_EXPECTED_DECLINE_5310_USER_REJECTED"
    }
  }
}
```

Current EBIRR telemetry tags:

- `EBIRR_EXPECTED_DECLINE_5309_INSUFFICIENT_BALANCE`
- `EBIRR_EXPECTED_DECLINE_E10205_INSUFFICIENT_BALANCE`
- `EBIRR_EXPECTED_DECLINE_5310_USER_REJECTED`
- fallback: `EBIRR_EXPECTED_DECLINE`

Rule: `checkoutUrl` is `http(s)`-only; any non-http scheme (for example `tel:`/USSD/custom schemes) is returned as `null`.

### EBIRR checkout UI contract (Flutter)

For EBIRR, backend now provides explicit UI directives so clients can skip the in-app confirmation page and route directly to Order Details while polling payment status.

Contract fields:

- `skipOrderConfirmationScreen: boolean` (for EBIRR this is `true`)
- `disableWebCheckoutFallback: boolean` (for EBIRR this is `true`; do not open WebView/dialer fallback)
- `paymentUiHint?: PaymentUiHint` (present for EBIRR)

```ts
type PaymentUiHint = {
  provider: 'EBIRR';
  state: 'PENDING_PUSH_CONFIRMATION' | 'PAID';
  message?: string;
  checkStatusEndpoint?: string; // e.g. /api/payments/sync-status/{orderId}
  recommendedPollIntervalMs?: number; // e.g. 4000
  skipOrderConfirmationScreen?: boolean; // true for EBIRR
  disableWebCheckoutFallback?: boolean; // true for EBIRR
  orderDetailsRoute?: string; // e.g. /orders/{orderId}
};
```

Where mobile can rely on this:

- `POST /api/orders` (top-level + nested under `order`)
- `POST /api/payments/sync-status/:orderId` (pending/failed responses include `skipOrderConfirmationScreen` for EBIRR)
- `GET /api/orders` and `GET /api/orders/:id` (order DTO includes the same fields)

Example fragment in create-order response:

```json
{
  "order": {
    "id": 352,
    "paymentStatus": "UNPAID",
    "skipOrderConfirmationScreen": true,
    "disableWebCheckoutFallback": true,
    "paymentUiHint": {
      "provider": "EBIRR",
      "state": "PENDING_PUSH_CONFIRMATION",
      "message": "A payment request has been sent to your phone. Confirm the system prompt/notification to complete payment.",
      "checkStatusEndpoint": "/api/payments/sync-status/352",
      "recommendedPollIntervalMs": 4000,
      "skipOrderConfirmationScreen": true,
      "disableWebCheckoutFallback": true,
      "orderDetailsRoute": "/orders/352"
    }
  },
  "checkoutUrl": null,
  "skipOrderConfirmationScreen": true,
  "disableWebCheckoutFallback": true
}
```

## Home feed hydration contract (Flutter alignment)

Endpoint: `GET /api/v2/home/feed`

- Purpose: support **two-phase home rendering** (fast first paint, then full hydration).
- Query input:
  - `hydrationMode=initial|deferred|full`
  - Backward-compatible aliases: `minimal=true` => `initial`, `hydrate=true` => `deferred`
  - Recommended follow-up reason: `refreshReason=deferred_hydration`
- Response header:
  - `X-Home-Hydration-Stage: initial_minimal | deferred_full | full`
- Response body additions:
  - `meta.hydrationStage` mirrors the header stage.
  - `deferredHydration.enabled` indicates if sections are still pending.
  - `deferredHydration.pendingSections` lists deferred sections.
  - `deferredHydration.nextRequest` provides recommended follow-up query fields.

### QA: immersive strip telemetry header

- Enable immersive similar images: `HOME_IMMERSIVE_SIMILAR_IMAGES_ENABLED=1`
- Verify response headers quickly:

```bash
curl -I "http://localhost:3000/api/v2/home/feed?hydrationMode=initial&refreshReason=initial_load"
```

- Expected header (when enabled):
  - `X-Home-Immersive-Strip: attempted=<n>;hydrated=<n>;fallback=<n>;no_match=<n>;no_match_rate=<r>`

### Expected client flow

1. Initial request (fast):

```http
GET /api/v2/home/feed?hydrationMode=initial&refreshReason=initial_load
```

- Returns: `exploreProducts` + `featuredProducts` immediately.
- Defers non-critical sections: categories and curated sections.

2. Follow-up hydration request:

```http
GET /api/v2/home/feed?hydrationMode=deferred&refreshReason=deferred_hydration
```

- Returns full hydrated home payload (subject to timeout fail-open protections).

3. Optional one-shot full mode:

```http
GET /api/v2/home/feed?hydrationMode=full
```

## Product contract: Restaurant/Catering

For listings under restaurant/catering/food/beverage/cafe categories, mobile/web clients must use canonical restaurant attributes.

Exception: `Food & Beverages > Restaurant & Catering Deals` no longer uses/enforces restaurant variation attributes.

- Canonical keys (inside `attributes`): `menuSection`, `availability`, `serviceType`, `orderClass`
- `menuSection` is required for restaurant/catering listings.
- Allowed value input formats:
  - Display values (for example: `Main Dishes`, `Out of stock`, `Dine-in`, `Special Order`)
  - camelCase tokens (for example: `mainDishes`, `outOfStock`, `dineIn`, `specialOrder`)
- Backward compatibility (accepted, but deprecated/prefer camelCase):
  - snake_case enum tokens (for example: `main_dishes`, `out_of_stock`, `dine_in`, `special_order`)
  - snake_case keys (`menu_section`, `stock_status`, `service_type`, `order_class`, `order_type`)
- Rejected input keys:
  - legacy non-canonical keys (`section`, `stockStatus`, `service`, `orderType`)
- Request-time top-level fallback supports canonical keys and snake_case aliases; all are merged into canonical `attributes` keys.
- If both top-level canonical fields and `attributes` are provided, `attributes` wins.

## License

UNLICENSED (private).

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
