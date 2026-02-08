# AI Prompt for Flutter Development: Aligning Suuq S with New Operational Flows

**Context:**
The core backend payment infrastructure (NestJS) and Admin Dashboard (React) have been updated to support a **Manual Payout Workflow**.

- **Issue**: The primary payment gateway, Ebirr, currently supports collections (C2B) but not automated payouts (B2C) for the platform account type.
- **Solution**: We have implemented a "Wallet + Manual Payout" model. Vendors collect funds into an internal wallet, and payouts are processed manually by the finance team on a weekly schedule.
- **Goal**: Update the Flutter Mobile App (Suuq S) to reflect this reality to Vendors and Customers, managing expectations and providing visibility into the new status flows.

**Instructions for the AI Developer:**
Please analyze the `lib/` codebase and implement the following changes to align with the backend operational shifts.

---

### 1. Vendor Wallet & Payout UI

**Target File(s):** `lib/features/wallet/screens/wallet_screen.dart`, `lib/features/wallet/widgets/payout_list.dart` (or similar).

- **Logic Update**:
  - The `GET /wallet/payouts` endpoint returns a list of `PayoutLog` objects.
  - Map the backend `status` field (`PENDING`, `SUCCESS`, `FAILED`) to UI states.
- **UI Changes**:
  - **Banner**: Add a persistent Info Card at the top of the Wallet Dashboard:
    > "To ensure security, earnings are settled weekly manually. Your payout requests will appear as 'Pending' until processed every Monday."
  - **Status Badges**:
    - `PENDING`: Display as **Yellow/Amber** chip with label "Processing".
    - `SUCCESS`: Display as **Green** chip with label "Paid".
    - `FAILED`: Display as **Red** chip with label "Failed".
  - **Reference**: If a `transactionReference` exists and status is `SUCCESS`, display it (e.g., "Bank Ref: TXN123...") so the vendor can check their bank statement.

### 2. Payment Methods (Customer Checkout)

**Target File(s):** `lib/features/checkout/screens/payment_method_screen.dart`

- **Ebirr**: Ensure this is the **primary/default** selected option.
- **Telebirr**:
  - **Hide** this option entirely for now, OR
  - Wrap it in a Feature Flag check (e.g., `remoteConfig.getBool('enable_telebirr')`), default false.
  - _Reason_: We are waiting for live API keys from Ethio Telecom.

### 3. Vendor Settlement Terms (New View)

**Target File(s):** `lib/features/vendor/screens/vendor_settings_screen.dart`

- Add a new menu item: **"Payout & Settlement Terms"**.
- **Content**: A static text view (or fetched from a Markdown endpoint if available, but static is fine for now):
  - **Frequency**: Weekly (e.g., Mondays).
  - **Minimum Balance**: (If applicable, e.g., 500 ETB).
  - **Methods**: Bank Transfer, Ebirr, Telebirr (Manual).
  - **Support**: Link to support chat if a payout is delayed > 7 days.

### 4. Data Models

**Target File(s):** `lib/models/payout_log.dart` (ensure it matches the backend entity).

```dart
enum PayoutStatus { pending, success, failed }
enum PayoutProvider { ebirr, mpesa, telebirr }

class PayoutLog {
  final int id;
  final double amount;
  final String currency;
  final String status; // Map to enum
  final String? transactionReference;
  final DateTime createdAt;

  // ... fromJson factory
}
```

**Technical Notes:**

- Backend API Base: `https://api.suuq.ugasfuad.com` (Prod)
- Wallet Endpoints:
  - Balance: `GET /api/wallet/balance`
  - History: `GET /api/wallet/payouts`
- Authentication: Use existing JWT Bearer token logic.

---

**Verification**:
After implementing, run a test as a Vendor:

1.  Navigate to Wallet.
2.  Verify the "Weekly Settlement" banner is visible.
3.  Check that past payouts show correct status colors.
