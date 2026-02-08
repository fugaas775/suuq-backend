# Operational Guide: Manual Payouts & Wallet Management

This guide outlines the manual payout workflow required while Ebirr B2C API is unavailable and Telebirr is pending activation.

## 1. Payout Lifecycle

The system now records `PayoutLog` entries for every vendor earning that needs disbursement.

- **Trigger**: When an Order is marked `PAID`.
- **Action**:
  1. Vendor Wallet is credited immediately.
  2. A `PayoutLog` is created with status `PENDING`.

## 2. Weekly Payout Workflow

**Role**: Admin / Finance Manager  
**Frequency**: Weekly (e.g., every Monday)

### Step 1: Export Pending Payouts

Generate a CSV file of all pending payouts to process.

**Ideally via Admin Dashboard**, or if using CLI access:

```bash
# Run the export script (ensure you are in the project root)
npx ts-node scripts/export-payouts.ts
```

_Output_: `payouts-YYYY-MM-DD.csv`

**CSV Columns**:

- `Payout ID`: Unique system ID.
- `Vendor ID`: Internal User ID.
- `Vendor Name`: Legal or Display Name.
- `Vendor Phone`: M-Pesa / Telebirr / Ebirr number.
- `Amount`: Amount to transfer.
- `Currency`: ETB, KES, etc.
- `System Ref`: `PAYOUT-MANUAL-{orderId}-{itemId}`.

### Step 2: Execute Transfers

Use your business banking portal, Ebirr merchant app, or Telebirr enterprise dashboard to send funds.

- **To**: Vendor Phone
- **Amount**: Amount from CSV
- **Reference/Note**: Use the `System Ref` (e.g., `PAYOUT-MANUAL-101-5`) if the bank allows, or just "Suuq Payout".

**Important**: Record the **Bank Transaction ID** (e.g., `TXN12345ABC`) for every successful transfer.

### Step 3: Reconcile (Mark as Paid)

Once transfers are done, you must update the system to reflect that the money has moved. This prevents double-payment.

**Using CLI:**

```bash
# Usage: npx ts-node scripts/mark-payout-paid.ts <PAYOUT_ID> <BANK_REF>

# Example:
npx ts-node scripts/mark-payout-paid.ts 54 TXN888999
```

**Using API (Postman/Curl):**

```http
PUT /api/admin/wallet/payouts/54 (Authenticated Admin)
Content-Type: application/json

{
  "status": "SUCCESS",
  "reference": "TXN888999"
}
```

## 3. Telebirr Readiness

The `TelebirrService` is fully implemented but requires valid credentials from Ethio Telecom.

**To Activate:**

1.  Obtain `App ID`, `App Key`, `Short Code`, `Public Key` from Ethio Telecom.
2.  Update `.env` file:
    ```dotenv
    TELEBIRR_APP_ID=...
    TELEBIRR_APP_KEY=...
    TELEBIRR_SHORT_CODE=...
    ```
3.  The system will automatically switch to using Telebirr API for collections once configured.

## 4. Troubleshooting

- **Failed Payouts**: If a manual transfer fails (e.g., wrong number), you can mark the payout as `FAILED` using the API.
  - _Note_: This does currently **not** automatically revert the Wallet balance. You may need to manually debit the wallet via DB or Admin UI if you want to reverse the earning.
