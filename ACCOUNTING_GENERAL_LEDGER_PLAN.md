# Backend Plan — General Ledger for Service-Format Accounting

> Companion to the pos-s frontend work (already shipped on `feat/revenue-reengineering`).
> Frontend now sends a `financialClassification` block on `/pos/v1/checkouts/ingest`,
> a `/pos/v1/checkouts/receivable-settlement` call, and a deposit refund/forfeit trio on
> the property/folio settle bodies. This plan makes the backend post those — and every
> other financial event — to a real double-entry general ledger that the statements read from.

## Context — why a ledger, and what changes

Today `src/billing/branch-financial-reports.service.ts` **derives** the Income Statement, Balance Sheet and Trial Balance **100% on the fly** by aggregating source tables (`pos_checkouts`, `branch_expenses`, `purchase_orders`, `branch_inventory`, the fixed-asset/depreciation/accrued-liability/long-term-debt tables, and register floats). There is **no journal, no chart of accounts, no posted entries**; the Trial Balance is synthesized from the derived P&L + BS and "balances" only by the `equity = assets − liabilities` identity.

The decision is to replace this with a **real general ledger**: a chart of accounts, balanced journal entries posted from every financial event, and statements computed from account balances. This is audit-grade and is the only model in which the new accounts (Accounts Receivable, Customer Deposits, Deferred Revenue) reconcile correctly over time.

**Design stance: GL control accounts + subsidiary ledgers.** We do **not** delete the existing tables. `branch_fixed_assets`, `branch_depreciation_entries`, `branch_accrued_liabilities`, `branch_long_term_debts`, `branch_expenses`, `purchase_orders`, `branch_inventory`, and `pos_checkouts` become **subsidiary ledgers** that _post_ to GL control accounts and retain the detail (notably the as-of-date maturity logic that splits accrued liabilities and long-term debt into current vs non-current — a flat account balance can't express that). The GL holds the authoritative totals; the sub-ledgers supply classification detail.

---

## 1. Data model (3 new entities + 1 enum module)

New module `src/accounting/` (mirrors the `billing` module wiring pattern in `src/billing/billing.module.ts`).

### 1a. Chart of accounts — `gl_accounts`

`src/accounting/entities/gl-account.entity.ts`. Global (codes are universal; balances are per-branch via journal lines). Seeded by migration.

| Column          | Type              | Notes                                             |
| --------------- | ----------------- | ------------------------------------------------- |
| `id`            | int PK            |                                                   |
| `code`          | varchar(8) unique | stable semantic key (below)                       |
| `name`          | varchar(128)      |                                                   |
| `type`          | enum              | ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE        |
| `normalBalance` | enum              | DEBIT, CREDIT                                     |
| `isCurrent`     | boolean null      | for ASSET/LIABILITY presentation; null for others |
| `contra`        | boolean           | true for Accumulated Depreciation                 |

**Seeded codes** (the `GlAccountCode` const enum in `src/accounting/gl-accounts.constant.ts`):

```
1000 CASH                       ASSET  debit  current
1010 TENDER_CLEARING            ASSET  debit  current
1100 ACCOUNTS_RECEIVABLE        ASSET  debit  current
1200 INVENTORY                  ASSET  debit  current
1500 FIXED_ASSETS               ASSET  debit  non-current
1510 ACCUMULATED_DEPRECIATION   ASSET  credit non-current (contra)
2000 SUPPLIER_PAYABLES          LIAB   credit current
2100 TAX_PAYABLE                LIAB   credit current
2200 TIPS_PAYABLE               LIAB   credit current   (see §4 — memo, not posted yet)
2300 CUSTOMER_DEPOSITS          LIAB   credit current
2400 DEFERRED_REVENUE           LIAB   credit current
2500 ACCRUED_LIABILITIES        LIAB   credit (split by sub-ledger)
2600 LONG_TERM_DEBT             LIAB   credit (split by sub-ledger)
3000 OWNER_EQUITY               EQUITY credit
4000 SERVICE_REVENUE            REVENUE credit
4100 RENTAL_REVENUE             REVENUE credit
5000 COGS                       EXPENSE debit
5100 COST_OF_SERVICES           EXPENSE debit
6000 EXPENSE_RENT … 60xx        EXPENSE debit  (one per BranchExpenseCategory + DEPRECIATION, INTEREST)
```

### 1b. Journal — `gl_journal_entries` + `gl_journal_lines`

`src/accounting/entities/gl-journal-entry.entity.ts`, `gl-journal-line.entity.ts`. Use the repo's `decimalTransformer` (numeric 14,2 → JS number) pattern used across the billing entities.

`gl_journal_entries`: `id`, `branchId`, `occurredAt` (financial date — drives period/as-of filtering), `postedAt`, `sourceType` (enum: POS_CHECKOUT, POS_RETURN, POS_VOID_REVERSAL, AR_SETTLEMENT, DEPOSIT_OPEN, DEPOSIT_REFUND, DEPOSIT_FORFEIT, REVENUE_ACCRUAL, EXPENSE, FIXED_ASSET, DEPRECIATION, ACCRUED_LIABILITY, ACCRUED_SETTLEMENT, LONG_TERM_DEBT, PURCHASE_ORDER, OPENING_BALANCE, MANUAL), `sourceId` (varchar — ref to the source row), `idempotencyKey` (unique with `branchId`), `currency`, `memo`, `reversesEntryId` (null), `reversedByEntryId` (null), `createdByUserId`, `createdAt`.

`gl_journal_lines`: `id`, `entryId` (FK, cascade), `accountCode` (varchar(8), FK→`gl_accounts.code`), `branchId` (denormalized for fast balance queries), `debit` (numeric 14,2 default 0), `credit` (numeric 14,2 default 0), `occurredAt` (denormalized from entry for index-only balance scans), `currency`, `metadata` jsonb (e.g. `{productId}` for COGS, customer ref for AR).

**Indexes:** `gl_journal_lines (branchId, accountCode, occurredAt)` — the hot path for every balance query. Unique `gl_journal_entries (branchId, idempotencyKey)`.

**Invariant:** every entry's `sum(debit) == sum(credit)` (enforced in the posting service before insert; optionally a deferred DB constraint via trigger).

### 1c. Migration

`src/migrations/20260702000000-CreateGeneralLedger.ts` — creates the three tables + indexes and **seeds `gl_accounts`** with the codes above. Follows the `CreateBranchAccountingTables` migration style.

---

## 2. Posting service

`src/accounting/general-ledger.service.ts`:

- `post(entry: {branchId, occurredAt, sourceType, sourceId, idempotencyKey, currency, lines: {accountCode, debit?, credit?, metadata?}[], memo?}, manager?)`
  - Validates `sum(debit) === sum(credit)` (tolerance 0.005) and every `accountCode` exists → throws `UnbalancedJournalEntryError` otherwise.
  - **Idempotent**: if `(branchId, idempotencyKey)` exists, return it unchanged (no-op). Mirrors the existing checkout idempotency contract.
  - Inserts entry + lines atomically; accepts an optional TypeORM `manager` so callers can post inside their own transaction (the checkout ingest already runs in one).
- `reverse(entryId, {sourceType, idempotencyKey, occurredAt})` — posts a mirror entry (debits↔credits), links both via `reversesEntryId`/`reversedByEntryId`. Used by VOID and as a building block for corrections.
- `balance(branchId, accountCode, {from?, to?})` and `balancesByType(branchId, asOfAt)` — sum `debit − credit` (signed by account `normalBalance`) for the report layer. One indexed query per account or a single grouped query for the whole BS.

All money via the shared `decimalTransformer`; never re-round in the service (callers pass already-rounded amounts from the frontend `financialClassification`, which uses `roundMoney`).

---

## 3. Wiring posting into every financial event

For the GL to be authoritative, **every** event posts. Each integration is a single `glService.post(...)` call added to the existing write path, inside the existing transaction where one exists.

### 3a. POS checkout ingest (`src/pos-sync/pos-checkout.service.ts`)

Extend `IngestPosCheckoutDto` (`src/pos-sync/dto/ingest-pos-checkout.dto.ts`) with an optional, validated `financialClassification` block (nested DTO) and persist it into the existing `pos_checkouts.metadata` jsonb (no column change). Then, after the checkout row is PROCESSED, post per recognition basis:

**SALE, cash basis** (RETAIL group, LAUNDRY, BARBER, SALON_SPA, CAFETERIA, QSR):

```
Dr CASH / TENDER_CLEARING   paidAmount          (split by tender method: CASH→1000, else→1010)
Dr ACCOUNTS_RECEIVABLE      total − paidAmount   (on-account remainder; only if > 0)
  Cr SERVICE_REVENUE/RENTAL_REVENUE  revenue.amount   (= total − tax)
  Cr TAX_PAYABLE                     taxPayable
```

Balanced: `paidAmount + (total − paidAmount) = total = revenue + tax`. ✓
COGS (cogsSource=INVENTORY): a second entry `Dr COGS / Cr INVENTORY` for `Σ(WAC × qty)` using the existing `computeWeightedAverageCosts`. Service-cost formats post nothing here unless a service-cost ratio is configured (open question — default skip).

**SALE, accrual basis** (HOTEL/PROPERTY_RENTAL) — the checkout at folio settle is the _payment_, not the revenue event; revenue is recognized by §3e. At settle: `Dr CASH … / Cr DEFERRED_REVENUE` (and AR for any unpaid remainder). See §3d/§3e.

**RETURN** (`transactionType=RETURN`, `reversalOf` set): post the negative of the SALE template (amounts already negative on the return receipt) with `sourceType=POS_RETURN`.

### 3b. VOID (`voidCheckout`, `pos-checkout.service.ts`)

Today void only flips status. Add: look up the checkout's journal entry by `idempotencyKey` and call `glService.reverse(...)` (`sourceType=POS_VOID_REVERSAL`). This makes voids actually back out revenue/tax/AR/COGS.

### 3c. AR settlement — **new endpoint** (`/pos/v1/checkouts/receivable-settlement`)

New controller method + `SettleReceivableDto` matching the frontend `buildReceivableSettlementPayload` shape (`branchId, idempotencyKey, currency, originalReceiptNumber, settledAmount, settledAt, tenders[], customerReference`). Posts:

```
Dr CASH / TENDER_CLEARING   settledAmount
  Cr ACCOUNTS_RECEIVABLE    settledAmount
```

Idempotent on the frontend-supplied `ar-settle-…` key. Optionally records a row in a lightweight `pos_receivable_settlements` sub-ledger for traceability (recommended; same shape as the booking-payments jsonb approach).

### 3d. Deposits (`src/property-rental/property-rental-booking.service.ts`, `src/hospitality/hotel-folio.service.ts`)

- **At open** (deposit collected): `Dr CASH / Cr CUSTOMER_DEPOSITS` for `depositAmount`. (`sourceType=DEPOSIT_OPEN`.)
- **At settle**, extend `SettlePropertyBookingDto` (already has `depositRefund`) and `SettleFolioDto` (has none) with `depositHeld` + `depositForfeit`; add the two columns to the booking entity (+ migration) — folio can store on its jsonb. Post:
  - refund: `Dr CUSTOMER_DEPOSITS / Cr CASH` for `depositRefund`.
  - forfeit: `Dr CUSTOMER_DEPOSITS / Cr SERVICE_REVENUE` (or OTHER_INCOME) for `depositForfeit` — **open question (3)**.

### 3e. Deferred-revenue recognition — scheduled accrual job

A Nest `@Cron` (daily) in `src/accounting/revenue-accrual.service.ts`. For each OPEN accrual booking/folio, compute the earned portion since last recognition using the existing `computeBillingPeriods` / night-count + `PropertyRatePlan.{monthlyRate,weeklyRate,nightlyRate}` (HOTEL rate source — **open question (1)**), and post `Dr DEFERRED_REVENUE / Cr RENTAL_REVENUE|SERVICE_REVENUE (+ Cr TAX_PAYABLE for the tax slice)`. Idempotent key `accrual-${bookingId}-${periodIndex}`. Reuse the `backfill:property-rental-monthly` script's period math.

### 3f. Existing billing / PO / inventory events (make the GL complete)

Add one `glService.post` per write in their services:

- `BranchBillingService` expense create → `Dr EXPENSE_<category> / Cr CASH`.
- fixed-asset create → `Dr FIXED_ASSETS / Cr CASH`; depreciation-entry create → `Dr EXPENSE_DEPRECIATION / Cr ACCUMULATED_DEPRECIATION`.
- accrued-liability create → `Dr EXPENSE_<cat> / Cr ACCRUED_LIABILITIES`; settle → `Dr ACCRUED_LIABILITIES / Cr CASH`.
- long-term-debt create → `Dr CASH / Cr LONG_TERM_DEBT`.
- purchase-order received (status→RECEIVED) → `Dr INVENTORY / Cr SUPPLIER_PAYABLES`.

**Tips:** **not posted** (would be an unbalanced single credit — tips have no cash leg in the current model; see the frontend memo). `TIPS_PAYABLE` stays a memo line derived from `pos_checkouts.tipAmount` until tips are collected via tender. Documented so no one "fixes" it into an unbalanced entry.

---

## 4. Cut the reports over to the ledger

Rewrite `branch-financial-reports.service.ts` so each statement line reads a control-account balance, **behind a config flag** `ACCOUNTING_LEDGER_ENABLED` (default off until reconciled):

- **P&L**: revenue = `−balance(4000)+−balance(4100)` over [from,to]; cogs = `balance(5000)+balance(5100)`; expensesByCategory from the 60xx balances; netProfit = revenue − cogs − expenses. (Returns stay netted because RETURN entries are signed.)
- **Balance Sheet**: each line = control-account balance as of `asOfAt`. New rows the frontend already renders — `assets.current.accountsReceivable` (1100), `liabilities.current.{customerDeposits (2300), deferredRevenue (2400), tipsPayable (2200 memo), taxPayable (2100)}` — plus the existing cash/inventory/fixed-assets/payables. **Current vs non-current** for accrued liabilities (2500) and long-term debt (2600) still comes from the sub-ledger maturity logic already in the service (GL gives the total, sub-ledger gives the split).
- **Trial Balance**: becomes a **real** TB — list every account's debit/credit balance directly from `gl_journal_lines`; it balances because every entry balances (no more synthesized owner-equity plug).

Keep the existing derived methods intact as `…Legacy()` so the flag can switch between them and the reconciliation harness can compare.

### Opening balances / backfill

`src/migrations/20260703000000-SeedOpeningLedgerBalances.ts` (or a `seed:` script): for each branch, post a single `OPENING_BALANCE` entry as of the cutover date that debits/credits each control account to its **current legacy-derived balance**, balancing against `OWNER_EQUITY`. This makes the ledger BS correct from day one without replaying full history. (Optional later epic: full historical replay of every source row into dated entries for period-accurate historical P&L.)

### Reconciliation harness (the gate)

`src/accounting/reconciliation.spec.ts` (+ a `scripts/reconcile-ledger.ts`): for representative branches and dates, compute each statement **both ways** (legacy derived vs ledger) and assert equality within 0.01 — **except `cash`**, which legitimately diverges (legacy derives cash from register floats minus expenses; the GL tracks true cash flow). Document the cash methodology change; treat the GL number as the corrected one. Only flip `ACCOUNTING_LEDGER_ENABLED` per environment once non-cash lines reconcile.

---

## 5. Phasing (each independently shippable; flag-gated)

- **P1 — Ledger infrastructure.** Module, 3 entities, migration + COA seed, `GeneralLedgerService` with `post`/`reverse`/`balance`, unit tests. Nothing posts yet. Zero behavior change.
- **P2 — POS posting.** Ingest DTO accepts + persists `financialClassification`; post SALE/RETURN + COGS; VOID reverses; AR-settlement endpoint. Sub-ledger detail unchanged.
- **P3 — Deposits + sub-ledger posting.** Deposit open/refund/forfeit (entity cols + migration + settle DTOs); expenses/fixed-assets/depreciation/accrued/debt/PO postings. Now the GL is complete.
- **P4 — Opening balances + reconciliation.** Seed opening entries; build the reconciliation harness; reconcile until green.
- **P5 — Report cutover.** Implement ledger-backed P&L/BS/TB behind `ACCOUNTING_LEDGER_ENABLED`; flip per environment after reconciliation passes.
- **P6 — Accrual job.** Daily deferred→earned recognition for HOTEL/PROPERTY_RENTAL (gated on open question 1).

## 6. Open questions (carried from the frontend contract)

1. **HOTEL nightly rate** for the accrual job — does a hotel rate plan persist it, or must pos-s send an `accrualSchedule`? (Property-rental has `PropertyRatePlan.nightlyRate/monthlyRate/weeklyRate`; confirm the hotel equivalent.)
2. **Service-cost basis** for `COST_OF_SERVICES` — configured % of revenue, per-service standard cost, or skip (gross profit = revenue for service formats)? P-default: skip until configured.
3. **Deposit forfeit** destination — `SERVICE_REVENUE` vs a new `OTHER_INCOME` account.
4. **Tax remittance** (paying TAX_PAYABLE to the authority) — a new manual billing action (`Dr TAX_PAYABLE / Cr CASH`) or a backend job? Out of POS scope.
5. **Tips** — confirmed memo-only (no cash leg). Revisit only if pos-s starts folding tips into the tender.

## 7. Risks

- **Balancing is non-negotiable** — the posting service must reject unbalanced entries; a single bad integration silently corrupts the BS. Mitigated by the per-entry invariant + the reconciliation harness.
- **Cash divergence** is expected and must be communicated, not "fixed" to match the old heuristic.
- **CI realities** (per project notes): local TS/eslint is more lenient than CI and the pre-commit hook can strip needed casts; e2e is infra-blocked (no Redis). Keep migrations and entities strictly typed; expect to validate types in CI, and run the reconciliation as a normal unit spec (no infra).
- **Scope** — P3/P3f touch many existing services; land them one service at a time behind the flag so a regression in one posting path can't block the others.

## 8. Files (create ✚ / modify ✎)

- ✚ `src/accounting/{accounting.module.ts, general-ledger.service.ts, gl-accounts.constant.ts, revenue-accrual.service.ts}`
- ✚ `src/accounting/entities/{gl-account.entity.ts, gl-journal-entry.entity.ts, gl-journal-line.entity.ts}`
- ✚ `src/accounting/dto/settle-receivable.dto.ts`
- ✚ `src/migrations/20260702000000-CreateGeneralLedger.ts`, `20260703000000-SeedOpeningLedgerBalances.ts`, `2026070x…-AddBookingDepositHeldForfeit.ts`
- ✎ `src/pos-sync/pos-checkout.{service,controller}.ts`, `src/pos-sync/dto/ingest-pos-checkout.dto.ts` (add `financialClassification`)
- ✎ `src/property-rental/{property-rental-booking.service.ts, dto/property-rental-booking.dto.ts, entities/property-rental-booking.entity.ts}`
- ✎ `src/hospitality/{hotel-folio.service.ts, dto/hotel-folio.dto.ts}`
- ✎ `src/billing/{branch-billing.service.ts, branch-financial-reports.service.ts, billing.module.ts}`
- ✎ `src/purchase-orders/purchase-orders.service.ts`, `src/app.module.ts` (register `AccountingModule` + cron), `src/data-source.ts` (entities/migrations if explicitly listed)

## 9. Verification

- Unit: `GeneralLedgerService` (balanced/unbalanced/idempotent/reverse), posting builders per event, accrual period math.
- `reconcile-ledger` spec green (non-cash lines match legacy within 0.01) before flipping the flag.
- Manual: ingest an account-credit SALE → BS `accountsReceivable` rises; post a receivable-settlement → it falls and cash rises. Open a PROPERTY_RENTAL booking with a deposit → `customerDeposits` rises; settle with a partial refund/forfeit → deposits clear, revenue picks up the forfeit. Confirm TB `balanced: true` from real lines.
- Build: `yarn build` clean (Node 22 — `eval "$(fnm env)" && fnm use 22.22.3` before committing so the pre-commit hook runs).
