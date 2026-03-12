# Flutter Order Files Alignment Prompt

Use this prompt with the Flutter codebase after the Order feature files were refactored.

## Prompt

You are updating the Suuq S Flutter mobile app to align the refactored Order feature with the current NestJS backend contract.

Context:

- The Flutter Order files were recently refactored, so first inspect the current `lib/` structure and identify the new order feature entry points before editing anything.
- Do not assume the old file paths still exist.
- Preserve the refactor's structure, naming, and state-management approach unless a backend contract mismatch forces a targeted change.
- Prefer fixing mapping, model, repository, and UI contract gaps at the root instead of adding one-off compatibility patches.

Goal:

- Make the Flutter Order feature fully compatible with the backend order, payment-status, payment-proof, and digital-download contracts.
- Preserve all EBIRR-specific order behaviors added by backend.
- Ensure Order List, Order Detail, Checkout completion, Payment Proof, and Digital Product download flows all work against the current API.

Backend contract to align with:

### 1. Order creation

Endpoint: `POST /api/orders`

Rules:

- Cart checkout: omit `items` and let backend use the server cart.
- Buy now: send `checkoutMode: "BUY_NOW"` and include `items`.
- If `checkoutMode` is `BUY_NOW` and `items` is missing or empty, backend returns `400`.
- Variant selections must be sent under `attributes` as key/value pairs.

Example payload:

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
  "items": [
    {
      "productId": 435,
      "quantity": 1,
      "attributes": {
        "size": "M",
        "color": "Black"
      }
    }
  ]
}
```

### 2. Order list and order detail

Endpoints:

- `GET /api/orders`
- `GET /api/orders/:id`

Flutter must correctly parse and preserve these fields on the order DTO when present:

- `id`
- `total`
- `status`
- `paymentMethod`
- `paymentStatus`
- `paymentLifecycleState`
- `paymentProofUrl`
- `proofOfDeliveryUrl`
- `paymentProofStatus`
- `deliveryFailureReasonCode`
- `deliveryFailureReasonLabel`
- `deliveryFailureNotes`
- `createdAt`
- `shippingAddress`
- `currency`
- `total_display`
- `delivererId`
- `delivererName`
- `delivererEmail`
- `delivererPhone`
- `assignedDelivererId`
- `assignedDelivererName`
- `assignedDelivererPhone`
- `assignedDelivererVehicle`
- `skipOrderConfirmationScreen`
- `disableWebCheckoutFallback`
- `paymentUiHint`
- `userId`
- `deliveryCode`
- `vendors`
- `vendorName`
- `storeName`
- `legalName`
- `businessName`
- `vendorAddress`
- `vendorCity`
- `vendorCountry`
- `items[]`

Each `items[]` entry may include:

- `productId`
- `productName`
- `productImageUrl`
- `quantity`
- `price`
- `attributes`
- `price_display`

### 3. EBIRR-specific order UI contract

For EBIRR orders, backend may return:

- `skipOrderConfirmationScreen: true`
- `disableWebCheckoutFallback: true`
- `paymentUiHint`

`paymentUiHint` may contain:

```json
{
  "provider": "EBIRR",
  "state": "PENDING_PUSH_CONFIRMATION",
  "message": "A payment request has been sent to your phone. Confirm the system prompt or notification to complete payment.",
  "checkStatusEndpoint": "/api/payments/sync-status/352",
  "recommendedPollIntervalMs": 4000,
  "skipOrderConfirmationScreen": true,
  "disableWebCheckoutFallback": true,
  "orderDetailsRoute": "/orders/352",
  "checkoutUrl": null,
  "receiveCode": null
}
```

Required Flutter behavior:

- If `skipOrderConfirmationScreen` is `true`, do not route to the legacy success/confirmation screen.
- Route directly into Order Details or the refactored equivalent screen.
- If `disableWebCheckoutFallback` is `true`, do not open WebView, external browser, dialer, or USSD fallback.
- If `paymentUiHint.checkStatusEndpoint` is present, use it for polling instead of hardcoding a path.
- Respect `recommendedPollIntervalMs` when polling.
- Support `paymentUiHint.state` values `PENDING_PUSH_CONFIRMATION`, `PAID`, and `FAILED`.
- Show `paymentUiHint.message` when available.
- Preserve this behavior in both create-order response handling and later order rehydration from list/detail endpoints.

### 4. Expected decline handling

For expected provider-side payment declines, backend returns HTTP `402` with:

- `error.code = PAYMENT_DECLINED`
- `error.details.expectedDecline = true`
- `error.details.telemetryTag`
- `error.details.providerCode`

Flutter should:

- Treat this as a handled payment outcome, not a generic crash.
- Show a user-friendly retry/change-payment-method message.
- Preserve provider metadata for analytics or logging if your architecture already supports it.

### 5. Payment proof files

Endpoints:

- `POST /api/orders/:id/payment-proof`
- `GET /api/orders/:id/payment-proof/signed`

Contract:

- Upload field name is `file`.
- Accepted file types are image only: `jpeg`, `jpg`, `png`, `webp`.
- Maximum size is `8MB`.
- Flutter must use multipart upload.
- Flutter should surface backend validation errors clearly.
- If a signed URL is returned for proof viewing, render or open it through the existing file-view strategy used elsewhere in the app.

### 6. Purchased digital product files

Endpoint:

- `GET /api/orders/:orderId/items/:itemId/signed-download`

Contract:

- This is buyer-gated.
- Flutter should only expose download/open actions for eligible purchased items.
- Use the returned short-lived signed URL immediately instead of caching it long-term.

### 7. Refactor-safe implementation requirements

When updating Flutter, follow these rules:

- First identify the new order feature structure, such as models, DTOs, API clients, repositories, controllers, cubits, blocs, notifiers, or screens.
- Centralize JSON parsing so list/detail/create responses share the same order model contract.
- Remove old assumptions that EBIRR always opens a checkout URL.
- Do not regress support for order item `attributes`.
- Do not hardcode old route names if the refactor introduced a new navigation layer.
- Do not duplicate order DTO definitions in multiple files if the refactor intended a single source of truth.

Implementation tasks:

1. Inspect the current Flutter order module and identify the new files responsible for:
   - order model parsing
   - order repository or API client
   - checkout result handling
   - order list screen
   - order detail screen
   - payment proof upload/view
   - digital download action
2. Update models and serializers to support the full backend order contract listed above.
3. Update network/data layer code so the correct endpoints and multipart payloads are used.
4. Update UI and navigation so EBIRR order flow respects `skipOrderConfirmationScreen`, `disableWebCheckoutFallback`, and `paymentUiHint`.
5. Verify order details still render item attributes, pricing, vendor info, payment proof state, and delivery-related fields.
6. Verify digital product download actions request a fresh signed URL from backend.
7. Remove or refactor any stale logic left over from the pre-refactor order file structure if it conflicts with the current backend contract.

Acceptance criteria:

- Buy Now still works with `checkoutMode: "BUY_NOW"` and selected `items`.
- Order List and Order Detail parse the same backend order shape without dropping fields.
- EBIRR checkout no longer depends on WebView/browser fallback.
- Refactored order screens can open directly into Order Details during pending EBIRR confirmation.
- Payment declines with HTTP `402` are handled gracefully.
- Payment proof upload works with multipart field `file` and image validation.
- Purchased digital items can request signed download URLs successfully.
- No duplicate or conflicting order DTOs remain after the refactor alignment.

Deliverables:

- Updated Flutter order models
- Updated order API/repository layer
- Updated checkout-to-order-details navigation logic
- Updated payment proof handling
- Updated digital download handling
- Short summary of files changed and any assumptions made due to the refactor
