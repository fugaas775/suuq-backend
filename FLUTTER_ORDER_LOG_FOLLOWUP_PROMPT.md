# Flutter Order Log Follow-up Prompt

Use this prompt after reviewing the latest backend and Flutter logs for the refactored order flow.

## Prompt

You are updating the Suuq S Flutter app based on the latest backend/runtime logs from a real EBIRR BUY_NOW flow.

What backend logs confirmed:

- `POST /api/orders` is working with `checkoutMode: "BUY_NOW"`.
- Backend returns buyer order details at `GET /api/orders/:id`.
- Backend returns EBIRR polling info through `paymentUiHint.checkStatusEndpoint`.
- Backend returns expected declines correctly, for example EBIRR `5310 / RCS_USER_REJECTED`.
- `GET /api/payments/sync-status/:orderId` is the correct polling endpoint.

What the logs show Flutter still needs to respect:

- After create-order, Flutter must treat `paymentUiHint.orderDetailsRoute` and buyer order detail as the source of truth.
- Flutter should not try vendor detail routes for a buyer order handoff.
- The `403` on `GET /api/vendor/orders/440` is expected in this path and should not be part of the buyer checkout fallback chain.
- EBIRR did not return a browser/WebView handoff URL; Flutter must continue using in-app order details plus polling.
- Expected decline `5310` is a handled outcome and should surface a user-facing decline message instead of a crash.

Required Flutter adjustments:

1. After `POST /api/orders`, if `skipOrderConfirmationScreen` is `true`, route directly to the buyer order details screen.
2. When `paymentUiHint.orderDetailsRoute` is present, use that buyer-order route mapping, not vendor order detail endpoints.
3. Do not call `/api/vendor/orders/:id` from the buyer checkout success/pending flow.
4. Poll only the provided `paymentUiHint.checkStatusEndpoint`.
5. Respect `paymentUiHint.recommendedPollIntervalMs`.
6. Explain to the user that they will receive an Ebirr Prompt USSD/Push notification directly on their phone and must approve the payment there. Display the `paymentUiHint.message` prominently so the user knows to look for it.
7. If sync status or refreshed order data indicates failure or expected decline, stop polling and show the decline/failure state cleanly.

Acceptance criteria:

- Buyer checkout no longer attempts vendor order detail fetches.
- No buyer-path 403 noise from `/api/vendor/orders/:id` during EBIRR checkout.
- Buyer order detail uses `GET /api/orders/:id`.
- Polling uses `/api/payments/sync-status/:orderId` from backend contract.
- EBIRR `5310` decline is shown as a handled rejected-payment state.
