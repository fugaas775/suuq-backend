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
- Internal metadata keys such as `offerId`, `offer_id`, `clientRef`, `client_ref` are ignored for variant validation and are not returned in order item attributes.

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
