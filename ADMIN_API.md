# Admin Panel API Documentation

This document describes the secure admin-level API endpoints for the marketplace platform.

## 🔐 Security

**All admin endpoints require authentication and proper authorization:**

- **Authentication**: JWT token in the `Authorization: Bearer <token>` header
- **Authorization**: User must have `ADMIN` or `SUPER_ADMIN` role
- **Base URL**: `/api/admin`

## 📋 User Management Endpoints

### GET /api/admin/users

Retrieve all users with pagination and optional role filtering.

**Query Parameters:**

- `role` (optional): Filter by role (VENDOR, CUSTOMER, ADMIN, SUPER_ADMIN)
- `page` (optional): Page number (default: 1)
- `pageSize` (optional): Items per page (default: 20)

**Response:**

```json
{
  "users": [...],
  "total": 150
}
```

### GET /api/admin/users/:id

Retrieve a specific user by ID.

**Response:** User object with all details

### PATCH /api/admin/users/:id

Update user information.

**Request Body:**

```json
{
  "displayName": "string",
  "avatarUrl": "string",
  "storeName": "string",
  "phoneCountryCode": "string",
  "phoneNumber": "string",
  "isActive": boolean,
  "verificationStatus": "PENDING|APPROVED|REJECTED",
  "verificationDocuments": ["string"],
  "verified": boolean
}
```

### POST /api/admin/users

Create a new ADMIN user (**SUPER_ADMIN only**).

**Request Body:**

```json
{
  "displayName": "Admin Name",
  "email": "admin@example.com",
  "password": "securePassword123"
}
```

### PATCH /api/admin/users/:id/roles

Update user roles (**SUPER_ADMIN only**).

**Request Body:**

```json
{
  "roles": ["ADMIN", "VENDOR"]
}
```

### PATCH /api/admin/users/:id/deactivate

Deactivate a user account.

**Response:** Updated user object with `isActive: false`

## 📦 Order Management Endpoints

### GET /api/admin/orders

Retrieve all orders with filtering and pagination.

**Query Parameters:**

- `status` (optional): Filter by order status
- `page` (optional): Page number
- `pageSize` (optional): Items per page

**Response:**

```json
{
  "orders": [...],
  "total": 500
}
```

### PATCH /api/admin/orders/:id/cancel

Cancel an order as admin.

**Response:** Updated order object with cancelled status

## 📊 Platform Stats Endpoint

### GET /api/admin/stats

Get comprehensive platform statistics.

**Response:**

```json
{
  "totalUsers": 1250,
  "totalVendors": 85,
  "totalCustomers": 1150,
  "totalAdmins": 15,
  "totalRevenue": 45000.5,
  "totalOrders": 2300,
  "pendingWithdrawals": 12
}
```

## 💰 Withdrawal Management Endpoints

### GET /api/admin/withdrawals

List all withdrawal requests with optional status filtering.

**Query Parameters:**

- `status` (optional): PENDING, APPROVED, REJECTED

### PATCH /api/admin/withdrawals/:id/approve

Approve a withdrawal request.

### PATCH /api/admin/withdrawals/:id/reject

Reject a withdrawal request.

## �️ Product Administration

These endpoints let admins safely remove or restore vendor products.

### DELETE /api/admin/products/:id

Soft-delete a product (ADMIN or SUPER_ADMIN). Hides it from public listings. Idempotent.

Request body (optional):

```json
{ "reason": "Duplicate listing" }
```

Response:

```json
{ "id": 123, "softDeleted": true, "previousStatus": "publish" }
```

### PATCH /api/admin/products/:id/restore

Restore a previously soft-deleted product (ADMIN or SUPER_ADMIN). Restores as draft and unblocks.

Request body (optional):

```json
{ "reason": "Appeal approved" }
```

Response:

```json
{ "id": 123, "restored": true }
```

### DELETE /api/admin/products/:id/hard

Hard-delete a product (SUPER_ADMIN only). Irreversible. Fails if orders exist for the product.

Request body (optional):

```json
{ "reason": "DMCA takedown" }
```

Response: 204 No Content

Notes:

- Audit log entries are recorded for all actions (soft delete / restore / hard delete).
- Hard delete attempts to clean up associated media in object storage on a best-effort basis.

## 🙋 Product Requests (Admin view)

These endpoints cover buyer-submitted product requests that admins triage and forward to vendors.

### GET /api/admin/product-requests

List requests (default newest first). Supports `status` CSV filter. Response objects now include `forwardedCount` when relation counts are loaded.

Key fields per request:

- `id`, `title`, `status`, `buyerId`, `categoryId`, `budgetMin`, `budgetMax`, `currency`, `preferredCity`, `preferredCountry`, `createdAt`.
- `forwardedCount` (number of vendors this request has been forwarded to).

### GET /api/admin/product-requests/:id

Returns the request with buyer, category, offers (with seller/product), acceptedOffer, and all forwards (vendor + forwardedByAdmin + forwardedAt).

### POST /api/admin/product-requests/:id/forward

Body:

```json
{ "vendorIds": [101, 202], "note": "optional", "channel": "email|in-app" }
```

Creates forward rows and (now) sends push notifications to the targeted vendors.

### Notification behavior

- On buyer creation of a product request, all `SUPER_ADMIN` users receive a push notification (title: "New product request").
- On admin forward, each targeted vendor receives a push (title: "New product request", body includes the request title when available).

## 📈 Supply Outreach Tasks (Feature-flagged)

**Endpoint**: `POST /api/admin/outreach-tasks`

Create a tracked supply outreach task when you spot repeated buyer demand (e.g., zero-result searches or product requests). Behind feature flag `FEATURE_SUPPLY_OUTREACH_TASKS_ENABLED`.

**Guards**:

- `ADMIN` or `SUPER_ADMIN`
- `@RequireFeature('supply_outreach_tasks')` + `FeatureFlagGuard`

**Request Body**

```json
{
  "term": "car parts",
  "requestIds": [42, 77, 81],
  "assignedVendorId": 3101,
  "note": "High demand in Addis Ababa this week",
  "payload": {
    "priority": "HIGH",
    "source": "zero-result-search"
  }
}
```

**Behavior**

- Validates that every `requestId` exists in `product_request`.
- Stores unique request ids, request count, and a summary payload (latest request date + location counts).
- Optionally links an initial vendor (`assignedVendorId`) and marks the task as `ASSIGNED`.
- Returns the persisted `supply_outreach_task` row (including auto-generated metadata).

**Sample Response**

```json
{
  "id": 12,
  "term": "car parts",
  "status": "ASSIGNED",
  "requestIds": [42, 77, 81],
  "requestCount": 3,
  "payload": {
    "requestCount": 3,
    "latestRequestAt": "2025-11-20T18:40:12.345Z",
    "locations": [
      { "country": "ET", "city": "Addis Ababa", "count": 2 },
      { "country": "ET", "city": null, "count": 1 }
    ],
    "priority": "HIGH",
    "source": "zero-result-search"
  },
  "note": "High demand in Addis Ababa this week",
  "createdByAdminId": 14,
  "assignedVendorId": 3101,
  "assignedAt": "2025-11-21T08:02:10.001Z",
  "createdAt": "2025-11-21T08:02:10.001Z",
  "updatedAt": "2025-11-21T08:02:10.001Z"
}
```

**Feature flag configuration**

```
FEATURE_SUPPLY_OUTREACH_TASKS_ENABLED=true
# Optional:
# FEATURE_SUPPLY_OUTREACH_TASKS_MIN_VERSION=1.45.0
# FEATURE_SUPPLY_OUTREACH_TASKS_PCT=50
```

Disable the flag to hide the endpoint without removing code.

## �🛡️ Permission Levels

- **ADMIN**: Access to all endpoints except user creation and role management
- **SUPER_ADMIN**: Full access to all admin endpoints including:
  - Creating new admin users
  - Managing user roles
  - All standard admin functions

## 📝 Error Responses

**401 Unauthorized**: Missing or invalid JWT token

```json
{
  "message": "Unauthorized",
  "statusCode": 401
}
```

**403 Forbidden**: Insufficient role permissions

```json
{
  "message": "Insufficient permissions",
  "statusCode": 403
}
```

**404 Not Found**: Resource not found

```json
{
  "message": "User not found",
  "statusCode": 404
}
```

## 🧪 Testing the Endpoints

All endpoints require authentication. First obtain a JWT token by logging in as an admin user, then include it in the Authorization header:

```bash
# Login as admin to get JWT token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "adminPassword"}'

# Use the token in admin requests
curl -X GET http://localhost:3000/api/admin/stats \
  -H "Authorization: Bearer <your-jwt-token>"
```

## ⚙️ Performance & Debug Features

### RolesGuard Logging Control

Set `ROLES_GUARD_DEBUG=1` in the environment to enable periodic (throttled to once every 5s per process) grant logs from the RolesGuard. Without this variable, only denials are logged, dramatically reducing noise under rapid admin polling.

### ETag / Conditional GET for User Detail

`GET /api/admin/users/:id` now returns a weak `ETag` header derived from the user's `updatedAt` timestamp, id, and verification status. Clients should send `If-None-Match` on subsequent requests; if unchanged the API responds with `304 Not Modified` and an empty body. Cache hint: `Cache-Control: private, max-age=15`.

Benefits:

- Cuts repeated payload transfer when UI polls or re-focuses the tab
- Reduces server-side serialization work
- Still reflects updates quickly (15s client-side freshness + conditional revalidation)

Example:

```bash
curl -i -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/admin/users/42

# Subsequent (unchanged) request using returned ETag value:
curl -i -H "Authorization: Bearer <token>" \
  -H 'If-None-Match: W/"u-abcdef12"' \
  http://localhost:3000/api/admin/users/42
```

## 🧹 User Hard Delete (Anonymization)

`DELETE /api/admin/users/:id/hard` no longer performs a physical row deletion (which was failing due to foreign key constraints from reviews/products). Instead it:

- Scrubs personally identifiable & contact fields (email, names, phone, avatars, business data)
- Replaces email with a tombstone format: `deleted+<userId>+<timestamp>@deleted.local` so the original email can be re‑registered
- Clears roles array and deactivates the account (`isActive=false`)
- Retains the row to preserve referential integrity and historical analytics (existing reviews / products still reference a now anonymized user)

Response: 204 No Content

### Why not cascade delete?

Physical deletion would either:

- Fail (current FK constraints: default NO ACTION), or
- Require adding `onDelete: 'CASCADE'` which risks wiping historical data, or
- Using `SET NULL` which breaks attribution for analytics.

The anonymization approach provides GDPR/PII protection while keeping metrics intact.

### Future Option: Full Cascade / Set NULL

If a project decision prefers true deletion:

1. Add migrations altering foreign keys (e.g., reviews.user) to `ON DELETE SET NULL`.
2. Make relation nullable in the entity.
3. Revert UsersService.remove to real `delete` when no blocking relations remain.

Open a ticket if you want this alternative implemented.

## 🔑 Auth Error Codes (for client handling)

All auth-related endpoints return structured errors under `error.code` for consistent client UX:

- INVALID_CREDENTIALS: Email/password mismatch
- USER_DEACTIVATED: Account exists but is deactivated (admin can reactivate)
- GOOGLE_NOT_CONFIGURED: Server missing Google client setup
- INVALID_GOOGLE_TOKEN: Bad/expired Google ID token
- GOOGLE_EMAIL_MISSING: Token lacks email
- USER_INACTIVE: Refresh token references a missing/inactive user
- INVALID_REFRESH_TOKEN: Bad/expired refresh token

Shape:

```json
{
  "error": {
    "code": "USER_DEACTIVATED",
    "message": "User account is deactivated.",
    "details": null
  }
}
```

Admin actions for deactivated accounts:

- PATCH /api/admin/users/:id/reactivate → re-enable login
- DELETE /api/admin/users/:id/hard → anonymize + free email for re-registration
