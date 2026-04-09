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

## POS-S Contract

POS-S should be built against the implemented backend contract in `retail-ops.controller.ts` and `purchase-orders.controller.ts`, not against admin procurement routes or inferred backend behavior.

POS portal auth/session routes:

- `POST /api/pos-portal/auth/login`
- `POST /api/pos-portal/auth/google`
- `POST /api/pos-portal/auth/apple`
- `GET /api/pos-portal/auth/session`

POS checkout sync routes for the local-first register outbox:

- `GET /api/pos/v1/checkouts?branchId=4&page=1&limit=20&status=PROCESSED&transactionType=SALE`
- `GET /api/pos/v1/checkouts/:id?branchId=4`
- `POST /api/pos/v1/checkouts/ingest`

POS partner-device routes for terminals using partner credentials instead of staff JWTs:

- `GET /api/pos/v1/checkouts/partner-history?branchId=4&page=1&limit=20`
- `GET /api/pos/v1/checkouts/partner-history/:id?branchId=4`
- `POST /api/pos/v1/checkouts/partner-ingest`
- `GET /api/pos/v1/register/partner-sessions?branchId=4&page=1&limit=20`
- `POST /api/pos/v1/register/partner-sessions`
- `POST /api/pos/v1/register/partner-sessions/:id/close`
- `GET /api/pos/v1/register/partner-suspended-carts?branchId=4&page=1&limit=20`
- `POST /api/pos/v1/register/partner-suspended-carts`
- `POST /api/pos/v1/register/partner-suspended-carts/:id/resume`
- `POST /api/pos/v1/register/partner-suspended-carts/:id/discard`

POS partner scope model:

- `pos:sync:write` for inventory-oriented POS sync ingestion
- `pos:checkout:read` for checkout history/detail reads
- `pos:checkout:write` for checkout receipt ingestion
- `pos:register:read` for register session and suspended-cart reads
- `pos:register:write` for register session open/close and suspended-cart mutations
- legacy scopes `sync:write` and `pos:ingest` are still accepted only as aliases for `pos:sync:write` during the transition
- when admin creates a new POS credential without explicitly supplying scopes, the backend now defaults it to the full explicit POS terminal bundle above

POS partner scope presets for admin issuance:

- `FULL_TERMINAL`: full checkout, register, and sync access
- `CASHIER_TERMINAL`: checkout read/write plus register read/write, without inventory sync
- `INVENTORY_TERMINAL`: sync write plus read-only checkout/register visibility
- `SYNC_ONLY`: inventory sync only
- admin clients should prefer `scopePreset` for normal POS terminal issuance and only send explicit `scopes` when they need a custom override beyond the standard preset bundles

POS portal auth purpose:

- exchange email/password, Google ID token, or Apple identity token for the normal Suuq JWT pair
- resolve active POS branch workspaces from branch ownership or branch staff assignments
- filter branch access down to branches with active Retail OS access that explicitly include the `POS_CORE` entitlement
- return a portal-ready payload with `branches`, `defaultBranchId`, `requiresBranchSelection`, and `portalKey`
- reject authenticated accounts that are not linked to any active POS branch workspace

POS-S workspace model:

- POS-S is one branch-workspace product, not a different product per seller category or seller size
- seller workspace data remains the business-level view, while each branch workspace is the operating and billable unit for checkout, stock, staff, and supplier execution
- grocery, pharmacy, fashion, electronics, and other retail categories all enter through the same branch-workspace contract when they need `POS_CORE`
- small sellers usually begin with one branch workspace, medium sellers add more branch coordination, and large sellers depend on the same backend truth across many branch workspaces rather than switching to a separate POS system
- Suuq S demand, POS-S operations, and B2B replenishment must continue to read from the same backend truth instead of forking category-specific workspace rules

Best-fit POS-S user categories:

- direct retail fit: grocery, pharmacy, fashion, electronics
- food-service preset fit: cafeteria, bakery counter, juice bar, takeaway kiosk
- hospitality extension fit: quick-service restaurant
- hospitality layer required: full-service restaurant

POS portal activation routes:

- `POST /api/pos-portal/auth/activation/trial`
- `POST /api/pos-portal/auth/activation`

POS portal activation contract:

- `POST /api/pos-portal/auth/activation/trial` request body: `{ "branchId": 21 }`
- trial activation response returns `branchId`, `branchName`, `status="TRIAL"`, `trialStartedAt`, `trialEndsAt`, `trialDaysRemaining`, and `providerMessage`
- `POST /api/pos-portal/auth/activation` request body: `{ "branchId": 21, "phoneNumber": "0911223344" }`
- paid activation response returns `branchId`, `branchName`, `referenceId`, `status`, `checkoutUrl`, `receiveCode`, and `providerMessage`
- trial activation is for the one 15-day branch-workspace opening path; paid activation remains the monthly Ebirr path

POS portal session payload fields used by POS-S and admin audit:

- each branch summary can now include `workspaceStatus`, `subscriptionStatus`, `planCode`, `canStartTrial`, `canStartActivation`, `canOpenNow`, `trialStartedAt`, `trialEndsAt`, and `trialDaysRemaining`
- `canStartTrial=true` means the branch is eligible to open immediately through the self-serve trial path
- `canOpenNow=true` means the branch already has access through `ACTIVE` or `TRIAL` workspace status and can be entered directly from the current POS session
- admin and seller surfaces should treat these fields as backend truth instead of rebuilding branch activation state from older subscription heuristics

Retail Ops routes already implemented for POS-S:

- `GET /api/retail/v1/ops/pos-operations`
- `GET /api/retail/v1/ops/pos-operations/network-summary`
- `GET /api/retail/v1/ops/pos-operations/exceptions`
- `GET /api/retail/v1/ops/pos-operations/exceptions/network-summary`
- `GET /api/retail/v1/ops/pos-operations/orders/:id`
- `GET /api/retail/v1/ops/stock-health`
- `GET /api/retail/v1/ops/stock-health/network-summary`
- `GET /api/retail/v1/ops/replenishment-drafts`
- `GET /api/retail/v1/ops/replenishment-drafts/network-summary`
- `POST /api/retail/v1/ops/replenishment-drafts/:id/re-evaluate`
- `GET /api/retail/v1/ops/hr-attendance`
- `GET /api/retail/v1/ops/hr-attendance/staff/:userId`
- `GET /api/retail/v1/ops/hr-attendance/exceptions`
- `GET /api/retail/v1/ops/hr-attendance/network-summary`
- `GET /api/retail/v1/ops/hr-attendance/compliance-summary`

Hub purchase-order routes used by POS-S:

- `GET /api/hub/v1/purchase-orders`
- `POST /api/hub/v1/purchase-orders`
- `POST /api/hub/v1/purchase-orders/:id/re-evaluate-auto-replenishment`
- `PATCH /api/hub/v1/purchase-orders/:id/status`
- `GET /api/hub/v1/purchase-orders/:id/receipt-events`
- `POST /api/hub/v1/purchase-orders/:id/receipt-events`
- `PATCH /api/hub/v1/purchase-orders/:id/receipt-events/:eventId/acknowledge`
- `PATCH /api/hub/v1/purchase-orders/:id/receipt-events/:eventId/discrepancy-resolution`
- `PATCH /api/hub/v1/purchase-orders/:id/receipt-events/:eventId/discrepancy-approval`

POS-S branch-scoping rules:

- retail routes remain explicitly branch-driven by `branchId` in query or body DTOs
- hub purchase-order reads and mutations now accept optional `branchId` query scoping for POS-S alignment
- when `branchId` is provided on hub purchase-order routes, list/read/mutation access is constrained to that branch
- POS-S should send `branchId` on hub purchase-order requests when operating as a branch workspace

Role expectations for POS-S purchase-order actions:

- `POS_MANAGER` and `B2B_BUYER` may list, create, re-evaluate, update status, record receipt events, acknowledge receipt events, resolve discrepancies, and approve discrepancy resolutions
- `SUPPLIER_ACCOUNT` remains valid on supplier-side purchase-order and receipt workflows where already allowed by the controller
- POS-S should not assume access to admin procurement endpoints or admin-only discrepancy force-close behavior

Guardrails for POS-S:

- do not switch POS-S to admin procurement routes
- do not assume a dedicated hub purchase-order detail endpoint exists unless it is added explicitly
- keep hub re-evaluation on `POST /api/hub/v1/purchase-orders/:id/re-evaluate-auto-replenishment`
- keep frontend form payloads aligned to shared DTO validation for positive ids, numeric quantities, and 3-letter currency codes
- keep register checkout sync separate from inventory-only POS sync jobs; the new checkout surface is the receipt/outbox contract
- partner-device routes use the same branch binding as POS sync keys; do not send a branch outside the credential's bound branch
- issue new POS terminal credentials with explicit `pos:*` scopes instead of the legacy sync aliases so read and write surfaces can be separated per device

POS checkout sync contract:

- `POST /api/pos/v1/checkouts/ingest` accepts a branch-scoped register receipt payload with `transactionType=SALE|RETURN`, totals, tenders, and line items.
- `registerSessionId` now references the server-side numeric session opened through `/api/pos/v1/register/sessions`; `suspendedCartId` optionally consumes a cart created through `/api/pos/v1/register/suspended-carts`.
- Each line item must include either `productId` or `aliasType` plus `aliasValue`; alias resolution follows the same branch and partner precedence used by POS sync jobs.
- Receipt ingestion is idempotent by `idempotencyKey` or `externalCheckoutId` within a branch.
- Successful `SALE` checkouts write one negative `SALE` stock movement per item; successful `RETURN` checkouts write one positive `ADJUSTMENT` stock movement per item.
- Checkout ingestion is atomic at the receipt level for inventory side effects; business-rule failures are persisted as `FAILED` checkout records with `failureReason` so POS-S can reconcile its local outbox.
- When `registerSessionId` is supplied, the checkout must target an open session on the same branch and register; when `suspendedCartId` is supplied, the cart must still be `SUSPENDED` and is marked `RESUMED` after a successful sale checkout.
- `GET /api/pos/v1/checkouts` returns paginated branch history with optional `status`, `transactionType`, `registerId`, and `registerSessionId` filters.
- `GET /api/pos/v1/checkouts/:id` returns the full stored receipt payload, including `items[]`, `tenders[]`, and any persisted failure reason.
- The `partner-history` and `partner-ingest` checkout routes mirror the JWT checkout contract but derive `partnerCredentialId` from the presented POS key.
- The `partner-sessions` and `partner-suspended-carts` routes mirror the JWT register contract for hardware terminals that authenticate with partner credentials instead of staff sessions.

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

## Vendor Portal Auth Contract

The vendor portal should use a social-first auth flow and must not rely on manual JWT paste as the primary production path.

Portal-specific endpoints:

- `POST /api/vendor-portal/auth/login`
- `POST /api/vendor-portal/auth/google`
- `POST /api/vendor-portal/auth/apple`
- `GET /api/vendor-portal/auth/session`

Purpose:

- exchange email/password, Google ID token, or Apple identity token for the normal Suuq JWT pair
- immediately resolve the authenticated user's vendor and vendor-staff store memberships
- return a portal-ready session payload so the frontend can auto-enter a single-store workspace or show a store chooser
- reject authenticated accounts that are not linked to any vendor workspace

Login request bodies:

- Google: `{ "idToken": "..." }`
- Apple: `{ "idToken": "..." }` or `{ "identityToken": "...", "email"?: "...", "name"?: "..." }`

Response shape for login/session:

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "user": {
    "id": 123,
    "email": "vendor@example.com",
    "roles": ["VENDOR"]
  },
  "stores": [
    {
      "vendorId": 123,
      "storeName": "My Store",
      "permissions": ["MANAGE_PRODUCTS"],
      "title": "Owner",
      "joinedAt": "2026-03-28T00:00:00.000Z"
    }
  ],
  "defaultVendorId": 123,
  "requiresStoreSelection": false
}
```

Non-vendor rejection contract:

- status: `403`
- body code: `VENDOR_PORTAL_ACCESS_DENIED`
- body message: `This account is not linked to any vendor store or staff workspace.`

Required backend env for social sign-in:

- Google: `GOOGLE_WEB_CLIENT_ID` and, if used by mobile/native clients, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`
- Apple: `APPLE_AUDIENCES` or `APPLE_CLIENT_IDS` or `APPLE_BUNDLE_ID`

Google Cloud Console requirements for the vendor portal web client:

- the Google OAuth web client used as `VITE_GOOGLE_CLIENT_ID` must list `https://vendor.ugasfuad.com` under Authorized JavaScript origins
- add any additional real portal origins separately, for example `https://www.vendor.ugasfuad.com` if that hostname is served
- if local development uses Google Sign-In, register the exact dev origin too, for example `http://localhost:5173`
- `origin_mismatch` happens before `/api/vendor-portal/auth/google` is called, so it is a Google OAuth client configuration issue rather than a backend token-exchange issue

Google Cloud Console requirements for the POS portal web client:

- the Google OAuth web client used as `VITE_GOOGLE_CLIENT_ID` for POS-S must list `https://pos.ugasfuad.com` under Authorized JavaScript origins
- add any additional real POS origins separately, for example `https://www.pos.ugasfuad.com` if that hostname is served
- if local development uses Google Sign-In, register the exact dev origin too, for example `http://localhost:5173`
- `origin_mismatch` happens before `/api/pos-portal/auth/google` is called, so it is a Google OAuth client configuration issue rather than a backend token-exchange issue

## Seller Workspace Contract

The seller-facing workspace should read from the backend seller projection instead of stitching vendor, POS, and subscription data independently in every client.

Workspace endpoints:

- `GET /api/seller/v1/workspace/profile`
- `GET /api/seller/v1/workspace/overview?windowHours=24`
- `GET /api/seller/v1/workspace/plans?windowHours=24`

Purpose:

- project the authenticated seller identity across vendor stores and POS branch workspaces
- expose channel connectivity across POS-S, Suuq S, B2B, and the shared backend
- translate current operational signals into a seller plan recommendation
- surface onboarding readiness without creating a second tenant or billing model

Current backend behavior:

- access is granted when the authenticated account is linked to at least one vendor store or POS branch workspace
- current plan is derived from active retail tenant subscriptions first, then falls back to legacy user subscription metadata when needed
- recommended plan is derived from live branch count, order volume, sales volume, and purchase-order activity in the requested window
- onboarding status is derived from linked store access, branch access, active retail subscriptions, published catalog, register activity, and supplier purchasing activity

Seller workspace rejection contract:

- status: `403`
- body code: `SELLER_WORKSPACE_ACCESS_DENIED`
- body message: `This account is not linked to any seller store or POS workspace.`

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
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://pos.ugasfuad.com,https://vendor.ugasfuad.com

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

### Procurement webhook admin governance

Endpoints:
- `GET /api/admin/b2b/procurement-webhooks/replay-operations/summary?subscriptionId=12&actorId=7&actorEmail=admin@example.com&from=2026-03-20T00:00:00.000Z&to=2026-03-21T00:00:00.000Z`
- `GET /api/admin/b2b/procurement-webhooks/replay-operations/summary/export?subscriptionId=12&actorId=7&actorEmail=admin@example.com&from=2026-03-20T00:00:00.000Z&to=2026-03-21T00:00:00.000Z`
- `GET /api/admin/b2b/procurement-webhooks/replay-operations/export?subscriptionId=12&actorId=9&actorEmail=admin@example.com&replayScope=BULK_TERMINAL_FAILURES&replayExecutionMode=PREVIEW_CONFIRMED_PAGE&previewConfirmed=true&from=2026-03-20T00:00:00.000Z&to=2026-03-21T00:00:00.000Z`

Purpose:
- return cross-subscription replay governance totals using the same audit filters as the replay-operation listing
- export the filtered replay governance totals as a single CSV row for spreadsheet triage and audit handoff
- export filtered replay operations row by row for event-level governance audit trails

Filter contract:
- `subscriptionId`, `actorId`, `actorEmail`, `from`, and `to` are supported on both the JSON summary and CSV export endpoints
- `replayScope`, `replayExecutionMode`, and `previewConfirmed` are additionally supported on the row-level replay export endpoint
- `actorEmail` must be a valid email address
- if both `from` and `to` are supplied, `from <= to` is required

Subscription detail contract additions on `GET /api/admin/b2b/procurement-webhooks/subscriptions/:id`:
- `hasReplayHistory`: true when replay-operation audit history exists for the subscription
- `hasPreviewConfirmedReplayHistory`: true when preview-confirmed replay history exists
- `hasAutoPauseHistory`: true when auto-pause audit history exists
- `replayOperationsExportRoute`: row-level CSV export route for filtered replay audit trails anchored to the subscription
- `replayGovernanceSummaryRoute`: JSON replay governance summary route anchored to the subscription
- `replayGovernanceSummaryExportRoute`: summary CSV export route anchored to the subscription
- these booleans are derived from filtered remediation-summary totals rather than the length of embedded recent activity arrays

### Admin supplier procurement operations

Endpoints:
- `GET /api/admin/b2b/supplier-profiles/procurement-scorecard?windowDays=30&limit=15&includeInactive=false&onboardingStatus=APPROVED&supplierProfileIds=7,9&branchIds=3,4&statuses=SUBMITTED,RECEIVED&from=2026-03-01T00:00:00.000Z&to=2026-03-19T23:59:59.999Z`
- `GET /api/admin/b2b/supplier-profiles/procurement-scorecard/export?...same filters...`
- `GET /api/admin/b2b/supplier-profiles/procurement-branch-interventions/dashboard?supplierProfileIds=7&branchIds=3&statuses=RECEIVED&latestActions=ASSIGN&actionAgeBuckets=OVER_24H&sortBy=STALE_FIRST&assigneeUserIds=21&includeUntriaged=false&supplierRollupSortBy=UNTRIAGED_DESC&branchRollupSortBy=INTERVENTION_COUNT_DESC&supplierRollupLimit=5&branchRollupLimit=3&from=2026-03-01T00:00:00.000Z&to=2026-03-20T08:00:00.000Z`
- `GET /api/admin/b2b/supplier-profiles/procurement-branch-interventions/dashboard/export?...same filters...`
- `GET /api/admin/b2b/supplier-profiles/procurement-branch-interventions/dashboard/overview?...same filters...`
- `GET /api/admin/b2b/supplier-profiles/procurement-branch-interventions/dashboard/overview/export?...same filters...`
- `GET /api/admin/b2b/supplier-profiles/procurement-branch-interventions?...same queue filters...`
- `GET /api/admin/b2b/supplier-profiles/procurement-branch-interventions/export?...same queue filters...`
- `GET /api/admin/b2b/supplier-profiles/:supplierProfileId/branches/:branchId/procurement-intervention-detail?windowDays=30&limit=10&statuses=RECEIVED&from=2026-03-01T00:00:00.000Z&to=2026-03-20T08:00:00.000Z`
- `PATCH /api/admin/b2b/supplier-profiles/:supplierProfileId/branches/:branchId/procurement-intervention-action`
- `GET /api/admin/b2b/supplier-profiles/:supplierProfileId/branches/:branchId/procurement-intervention-detail/export?...same detail filters...`
- `GET /api/admin/b2b/supplier-profiles/:id/procurement-trend?branchIds=3,4&statuses=RECEIVED&asOf=2026-03-19T12:00:00.000Z`
- `GET /api/admin/b2b/supplier-profiles/:id/procurement-trend/export?...same trend filters...`

Purpose:
- let admin operators rank suppliers by procurement performance, export scorecards, and drill into branch-level intervention hotspots
- expose compact dashboard and overview rollups for queue triage without requiring the full branch intervention payload
- support intervention audit workflows with detail drilldowns, action recording, and CSV exports
- provide supplier trend snapshots for 7, 30, and 90 day comparisons from the admin surface

Filter contract:
- `supplierProfileIds`, `branchIds`, `assigneeUserIds`, `statuses`, `latestActions`, and `actionAgeBuckets` accept comma-separated values and are validated instead of silently ignored
- `from`, `to`, and `asOf` must be valid ISO-style datetimes
- malformed supplier-procurement enum, id, and datetime filters now return `400` instead of being dropped and widening the query
- branch intervention detail and dashboard/list services require `from <= to` when both bounds are supplied
- scorecard filters also accept `includeInactive`, `onboardingStatus`, `windowDays`, and `limit`
- dashboard endpoints additionally accept `sortBy`, `includeUntriaged`, `supplierRollupSortBy`, `branchRollupSortBy`, `supplierRollupLimit`, and `branchRollupLimit`

Intervention action contract:
- body shape: `{ action, note?, assigneeUserId? }`
- supported `action` values: `ACKNOWLEDGE`, `ESCALATE`, `ASSIGN`, `RESOLVE`
- `note` is optional and capped at 500 characters
- `assigneeUserId`, when supplied, must be a positive integer

### Admin B2B retail operations audit surfaces

Endpoints:
- `GET /api/admin/b2b/branch-inventory?branchId=4&productId=55&page=1&limit=50`
- `GET /api/admin/b2b/stock-movements?branchId=4&productId=55&movementType=PURCHASE_RECEIPT&from=2026-03-10T00:00:00.000Z&to=2026-03-16T23:59:59.999Z&page=1&limit=50`
- `GET /api/admin/b2b/purchase-orders/:id/receipt-events?page=1&limit=20`
- `PATCH /api/admin/b2b/purchase-orders/:id/receipt-events/:eventId/discrepancy-approval`
- `PATCH /api/admin/b2b/purchase-orders/:id/receipt-events/:eventId/discrepancy-force-close`
- `GET /api/admin/b2b/pos-sync-jobs?branchId=4&partnerCredentialId=12&syncType=CATALOG&status=FAILED&failedOnly=true&page=1&limit=20`
- `GET /api/admin/b2b/pos-sync-jobs/:id`

Purpose:
- let admin operators audit current branch stock positions without leaving the B2B review surface
- expose chronological stock movement history and purchase-order receipt activity for replenishment investigations
- surface POS sync backlog and failed-entry detail for tenant-wide branch operations triage
- allow admin reviewers to resolve supplier receipt discrepancies from the same audit flow

Filter contract:
- branch inventory accepts optional `branchId`, `productId`, `page`, and `limit`
- stock movements additionally accept `movementType`, `from`, and `to`; `from` and `to` must be valid ISO-style datetimes
- receipt events are paginated with optional `page` and `limit` and return newest events first
- POS sync jobs accept optional `branchId`, `partnerCredentialId`, `syncType`, `status`, `failedOnly`, `page`, and `limit`
- `failedOnly=true` narrows the POS sync queue to jobs with rejected entries, explicit `FAILED` status, or captured failed-entry payloads

Receipt discrepancy action contract:
- discrepancy approval body shape: `{ note }`
- discrepancy force-close body shape: `{ note }`
- both actions attach admin actor metadata server-side and target a specific purchase-order receipt event

### Admin B2B purchase-order and transfer review

Endpoints:
- `GET /api/admin/b2b/branch-transfers?fromBranchId=3&toBranchId=8&status=DISPATCHED&page=2&limit=10`
- `GET /api/admin/b2b/branch-transfers/:id`
- `GET /api/admin/b2b/purchase-orders?branchId=3&supplierProfileId=14&status=DRAFT&autoReplenishment=true&autoReplenishmentSubmissionMode=AUTO_SUBMIT&autoReplenishmentBlockedReason=MINIMUM_ORDER_TOTAL_NOT_MET&page=2&limit=10`
- `GET /api/admin/b2b/purchase-orders/:id/audit?limit=15`
- `PATCH /api/admin/b2b/purchase-orders/:id/re-evaluate-auto-replenishment`

Purpose:
- let admin operators review persisted branch transfer documents alongside the replenishment and fulfillment state they create
- expose purchase-order review filters tailored to auto-replenishment draft governance
- expose a direct purchase-order audit helper route for status-change and workflow investigation without leaving the admin B2B surface
- allow admin users to re-evaluate blocked auto-replenishment drafts against the latest automation policy without leaving the B2B surface

Filter contract:
- branch transfer review accepts optional `fromBranchId`, `toBranchId`, `status`, `page`, and `limit`
- purchase-order review accepts optional `branchId`, `supplierProfileId`, `status`, `page`, and `limit`
- purchase-order review additionally supports `autoReplenishment`, `autoReplenishmentSubmissionMode`, and `autoReplenishmentBlockedReason`
- purchase-order audit accepts optional `limit` and defaults to `20` when omitted
- invalid enum and pagination filters return `400`

Re-evaluation contract:
- `PATCH /api/admin/b2b/purchase-orders/:id/re-evaluate-auto-replenishment` attaches admin actor metadata server-side
- the response includes `reevaluationOutcome` so operators can inspect the previous status, next status, and whether the draft was submitted or remained blocked

### Admin supplier onboarding and partner credential operations

Endpoints:
- `GET /api/admin/b2b/supplier-profiles/review-queue?status=PENDING_REVIEW`
- `PATCH /api/admin/b2b/supplier-profiles/:id/approve`
- `PATCH /api/admin/b2b/supplier-profiles/:id/reject`
- `PATCH /api/admin/b2b/partner-credentials/:id/revoke`
- `PATCH /api/admin/b2b/partner-credentials/:id/branch-assignment`

Purpose:
- let admin operators work the supplier onboarding queue from the same B2B surface used for procurement review
- attach actor metadata and optional rationale when approving or rejecting supplier profiles
- support POS terminal governance by revoking stale partner credentials and rotating active credentials between branches with audit context

Contract:
- supplier review queue accepts optional `status`; when omitted it defaults to `PENDING_REVIEW`
- supplier approval and rejection bodies accept optional `{ reason }` with a maximum of 500 characters
- partner credential revocation accepts optional `{ reason }` with a maximum of 500 characters
- partner credential branch rotation requires `{ branchId }` and accepts optional `{ reason }` with a maximum of 500 characters
- invalid review statuses and malformed body payloads return `400`

### Admin search log operations

Endpoints:
- `GET /api/admin/search-logs?q=coffee&source=mobile&limit=50`

Purpose:
- let admin operators inspect recent search activity by query text and search source without querying the database directly

Contract:
- `q` and `source` are optional string filters and are trimmed before query execution
- `limit` is optional, defaults to `50`, and must be between `1` and `200`
- malformed `limit` values return `400`

### Admin notification history operations

Endpoints:
- `GET /api/admin/notifications?page=2&limit=50&type=ORDER&userId=7`

Purpose:
- let admin operators inspect persisted notification history for a specific user or notification type without opening the database directly

Contract:
- `page` is optional, defaults to `1`, and must be a positive integer
- `limit` is optional, defaults to `20`, and must be between `1` and `200`
- `type` is optional and must be a valid notification enum value
- `userId` is optional and must be a positive integer when supplied
- malformed history filters return `400`

### Admin vendor review operations

Endpoints:
- `GET /api/admin/vendors?page=2&limit=50&vendorId=7&sort=verifiedAt&verificationStatus=APPROVED&certificationStatus=certified&country=ET&region=Addis&city=Bole&subscriptionTier=pro&minSales=100&minRating=4.5&meta=1`
- `GET /api/admin/vendors/search?q=acme&certificationStatus=certified&subscriptionTier=pro&limit=25&meta=1`
- `GET /api/admin/vendors/:id`
- `GET /api/admin/vendors/:id/audit?page=2&limit=10&actions=vendor.active.update&actorEmail=admin@example.com&actorId=9&from=2026-03-01T00:00:00.000Z&to=2026-03-20T23:59:59.999Z`
- `POST /api/admin/vendors/:id/confirm-telebirr`
- `PATCH /api/admin/vendors/:id/verification`
- `PATCH /api/admin/vendors/:id/active`

Purpose:
- let admin operators review vendor discovery filters, autocomplete candidates, and audit history from the back-office surface
- support targeted investigation of vendor verification and active-state changes without raw database access
- let admins confirm Telebirr status, update vendor verification, and gate active-state changes with audit logging

Contract:
- vendor list accepts optional `page`, `limit`, `q`, `search`, `vendorId`, `sort`, `verificationStatus`, `certificationStatus`, `country`, `region`, `city`, `subscriptionTier`, `minSales`, `minRating`, and `meta`
- `vendorId`, when supplied, takes precedence over `q` and `search` for the effective search term
- vendor search accepts optional `q`, `certificationStatus`, `subscriptionTier`, `limit`, and `meta`
- vendor audit accepts optional `page`, `limit`, `after`, `actions`, `actorEmail`, `actorId`, `from`, and `to`
- `limit` is capped at `100` for vendor list, search, and audit endpoints; malformed enum, numeric, and datetime filters return `400`

### Admin product-request review operations

Endpoints:
- `GET /api/admin/product-requests?status=OPEN,IN_PROGRESS&limit=25`

Purpose:
- let admin operators review buyer product requests with strict status filtering instead of permissive raw query parsing
- keep malformed list filters from silently widening the request queue shown to the admin surface

Contract:
- `status` is optional, accepts comma-separated product-request statuses, and must be one or more of `OPEN`, `IN_PROGRESS`, `FULFILLED`, `CANCELLED`, or `EXPIRED`
- `limit` is optional, defaults to `50`, and must be an integer between `1` and `100`
- malformed `status` and `limit` filters now return `400`

### Admin product review operations

Endpoints:
- `GET /api/admin/products?status=pending_approval&page=2&per_page=25&q=acme&featured=true`
- `GET /api/admin/products/subcategories/leaf?parentId=17&q=milk&limit=300`

Purpose:
- let admin operators review pending and featured product queues without permissive raw pagination parsing
- support admin subcategory reassignment flows with validated leaf-subcategory lookup filters instead of silently dropping malformed values

Contract:
- product review accepts optional `status`, `page`, `per_page`, `q`, and `featured`
- `status` remains aligned with the admin product queue values such as `publish`, `draft`, `pending`, `pending_approval`, `rejected`, and `all`
- `page` must be a positive integer and `per_page` must be an integer between `1` and `200`
- `featured` accepts only boolean query values
- leaf-subcategory lookup accepts optional `parentId`, `q`, and `limit`
- `parentId` must be a positive integer and `limit` must be between `1` and `2000`
- malformed product review and leaf-subcategory filters now return `400`

### Admin wallet operations

Endpoints:
- `GET /api/admin/wallet/top-ups?page=2&limit=25&status=APPROVED`
- `GET /api/admin/wallet/payouts?page=3&limit=10&status=FAILED`
- `GET /api/admin/wallet/payouts/auto-failures?page=4&limit=9`
- `GET /api/admin/wallet/payouts/exceptions?page=5&limit=8`
- `GET /api/admin/wallet/payouts/auto-failures/export?from=2026-03-01T00:00:00.000Z&to=2026-03-20T00:00:00.000Z`
- `GET /api/admin/wallet/transactions?page=2&limit=30&type=PURCHASE&orderId=17&userId=29&startDate=2026-03-01T00:00:00.000Z&endDate=2026-03-20T00:00:00.000Z`

Purpose:
- harden the admin wallet reporting surfaces so malformed pagination, status, date, and transaction-type filters fail fast instead of being silently widened or dropped
- preserve the legacy frontend transaction aliases while validating the rest of the query contract strictly

Contract:
- wallet top-up review accepts optional `page`, `limit`, and `status`
- top-up `status` must be one of `PENDING`, `APPROVED`, or `REJECTED`
- payout review accepts optional `page`, `limit`, and `status`
- payout `status` must be one of `PENDING`, `SUCCESS`, or `FAILED`
- failed auto-payout and payout-exception review accept positive integer `page` and `limit`
- failed auto-payout export accepts optional ISO `from` and `to` filters
- wallet transaction review accepts optional `page`, `limit`, `type`, `orderId`, `userId`, `startDate`, and `endDate`
- transaction `type` remains compatible with legacy aliases: `PURCHASE -> PAYMENT` and `SUBSCRIPTION_EXTENSION -> SUBSCRIPTION`
- malformed wallet query filters now return `400`

### Admin ads audit operations

Endpoints:
- `GET /api/admin/ads/audit?state=expired&page=2&per_page=25&q=boost`

Purpose:
- harden the admin featured-ads audit queue so malformed state or pagination filters fail fast instead of being silently coerced
- preserve the current repository-backed audit payload while validating the query boundary strictly

Contract:
- ads audit accepts optional `state`, `page`, `per_page`, and `q`
- `state` must be one of `active`, `expired`, or `all`
- `page` must be a positive integer and `per_page` must be an integer between `1` and `200`
- `q` is trimmed before being applied to the featured-product search filter
- malformed ads audit filters now return `400`

### Admin Ebirr audit operations

Endpoints:
- `GET /api/admin/ebirr/transactions?page=2&limit=75&search=BOOST-22`
- `GET /api/admin/ebirr/reconcile/initiated/report?olderThanMinutes=45&limit=150`

Purpose:
- harden the Ebirr admin audit surface so malformed pagination and reconciliation report filters fail fast instead of being silently coerced
- preserve the existing repository-backed transaction search and initiated-reconciliation dry-run behavior

Contract:
- Ebirr transaction audit accepts optional `page`, `limit`, and `search`
- `page` and `limit` must be positive integers; `search` is trimmed before being applied to the transaction search clause
- initiated reconciliation report accepts optional `olderThanMinutes` and `limit`
- `olderThanMinutes` must be a positive integer and `limit` must be an integer between `1` and `500`, matching the downstream reconciliation cap
- malformed Ebirr audit query filters now return `400`

### Admin user subscription and listing operations

Endpoints:
- `GET /api/admin/users/subscription/active?page=2&limit=25`
- `GET /api/admin/users/subscription/requests?page=3&limit=15&status=APPROVED`
- `GET /api/admin/users?page=2&limit=50&q=vendor&meta=1`

Purpose:
- harden the remaining raw admin user pagination and subscription request filters so malformed values fail fast instead of being silently coerced
- preserve the existing admin user list contract while validating the `meta` response toggle explicitly

Contract:
- active subscription review accepts optional positive integer `page` and `limit`
- subscription request review accepts optional positive integer `page`, positive integer `limit`, and `status`
- subscription request `status` must be one of `PENDING`, `APPROVED`, or `REJECTED`
- admin user list `meta` must be either `0` or `1`; only `meta=1` returns the `{ data, meta }` envelope
- malformed admin user query filters now return `400`

### Admin credit operations

Endpoints:
- `GET /api/admin/credit/users?page=2&limit=30&search=acme`

Purpose:
- harden the admin credit-limit review list so malformed pagination filters fail fast instead of being coerced into unexpected query-builder values

Contract:
- credit user review accepts optional positive integer `page`, positive integer `limit`, and `search`
- `search` is trimmed before being applied to the user email and display-name filter
- malformed credit list filters now return `400`

### Admin analytics search-keyword operations

Endpoints:
- `GET /api/admin/search-keywords?page=2&perPage=25&from=2026-03-01T00:00:00.000Z&to=2026-03-20T23:59:59.999Z&minSubmits=3&q=flour&sort=total_desc&city=Addis&country=ET&vendor=Acme`
- `GET /api/admin/search-keywords/top?window=week&limit=120`
- `GET /api/admin/search-keywords/top/summary?limit=150`
- `GET /api/admin/search-keywords/aggregations?window=month&limit=20`

Purpose:
- harden the largest remaining analytics query surface so malformed pagination, date, sort, and window filters fail fast instead of being silently coerced
- keep the primary and alias search-keyword analytics routes on one validated query contract

Contract:
- search-keyword listing accepts optional `page`, `perPage`, `from`, `to`, `minSubmits`, `q`, `sort`, `city`, `country`, and `vendor`
- `page` must be a positive integer and `perPage` must be an integer between `1` and `100`
- `from` and `to` must be ISO datetimes when provided
- `minSubmits` must be an integer greater than or equal to `0`
- `sort` must be one of `submit_desc`, `submit_asc`, `total_desc`, `total_asc`, `last_desc`, `last_asc`, `noresult_desc`, or `noresult_asc`
- top-keyword routes accept `window` in `day | week | month` and `limit` in `1..200`
- aggregation routes accept `window` in `day | week | month` and `limit` in `1..50`
- malformed analytics search-keyword filters now return `400`

### Hub purchase-order receipt-event lifecycle

Endpoints:
- `GET /api/hub/v1/purchase-orders/:id/receipt-events`
- `POST /api/hub/v1/purchase-orders/:id/receipt-events`
- `PATCH /api/hub/v1/purchase-orders/:id/receipt-events/:eventId/acknowledge`
- `PATCH /api/hub/v1/purchase-orders/:id/receipt-events/:eventId/discrepancy-resolution`
- `PATCH /api/hub/v1/purchase-orders/:id/receipt-events/:eventId/discrepancy-approval`

Purpose:
- expose the buyer and supplier receipt-event lifecycle for incremental receipt logging, supplier acknowledgement, discrepancy resolution, and final buyer approval
- document the contract that already exists on the hub controller, not only the mirrored admin receipt-event review routes

Contract:
- receipt-event listing returns the recorded receipt-event timeline for the purchase order
- receipt-event recording accepts optional `{ reason, metadata, receiptLines }`; `metadata` must be an object and `receiptLines` use incremental quantities per event
- supplier acknowledgement accepts optional `{ note }` with a maximum of `500` characters
- discrepancy resolution requires `{ resolutionNote }`, accepts optional `{ metadata }`, and rejects notes longer than `1000` characters
- discrepancy approval accepts optional `{ note }` with a maximum of `1000` characters
- malformed receipt-event payloads return `400`

Mutation contract:
- `POST /api/admin/vendors/:id/confirm-telebirr` body shape: `{ status }` where `status` must be `APPROVED` or `REJECTED`
- `PATCH /api/admin/vendors/:id/verification` body shape: `{ status, reason? }` where `status` must be a valid vendor verification enum value
- `PATCH /api/admin/vendors/:id/active` body shape: `{ isActive }` where `isActive` must be a boolean
- active-state changes are restricted to `SUPER_ADMIN`; non-super-admin callers receive `403`
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
