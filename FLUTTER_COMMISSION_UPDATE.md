# Flutter Commission Update Prompt

**Task:**
Update the Flutter mobile application to reflect the new **3% Platform Commission** (reduced from 5%).

**Context:**
The backend and admin panel have already been updated to use a 3% commission rate. The mobile app contains hardcoded references to "5%" or "0.05" in UI texts, tooltips, and fallback calculation logic that need to be synchronized.

**Files to Check & Update:**

1.  **`lib/features/wallet/screens/merchant_settlement_report_screen.dart`**
    - **Search for:** `0.05` or `5%`
    - **Action:**
      - Update fallback calculation logic: `(amount * 0.05)` -> `(amount * 0.03)`
      - Update UI Text: "Suuq Commission (5%)" -> "Suuq Commission (3%)"
      - Update PDF Export Text (if applicable): Ensure generating reports use the new rate label.

2.  **`lib/features/orders/screens/vendor_orders_screen.dart`**
    - **Search for:** "5%" or "Commission"
    - **Action:**
      - Update fee breakdown row: "Platform Fee (5%)" -> "Platform Fee (3%)"
      - Update any tooltips explaining the deduction.

3.  **Global Search (Recommended):**
    - Search the entire `lib/` directory for the string "5%" and "0.05" to catch any other occurrences in:
      - `onboarding_screen.dart` (Vendor terms?)
      - `product_detail_screen.dart` (Price breakdown?)
      - `wallet_screen.dart` (any static help text?)

**Verification:**

- Run the app and navigate to the **Merchant Settlement Report**.
- Verify that recent calculations align with the new 3% rate (or at least the label does, if the calculation is done on the backend).
- Check the **Order Details** view for a vendor order to ensure the fee label is correct.
