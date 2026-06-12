/**
 * Chart of accounts for the branch general ledger.
 *
 * This constant is the single source of truth for account codes and their
 * metadata (type, normal balance, current-vs-non-current classification). It is
 * consumed by:
 *  - the `gl_accounts` seed in the CreateGeneralLedger migration,
 *  - the GeneralLedgerService (normal-balance sign when computing balances,
 *    account-code validation when posting),
 *  - the (future) ledger-backed financial reports.
 *
 * Codes are stable string keys (loosely a 1xxx assets / 2xxx liabilities /
 * 3xxx equity / 4xxx revenue / 5xxx cost / 6xxx expense numbering). They are
 * GL-semantic and are never shown to end users or translated.
 */

export enum GlAccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export enum GlNormalBalance {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export enum GlAccountCode {
  CASH = '1000',
  TENDER_CLEARING = '1010',
  ACCOUNTS_RECEIVABLE = '1100',
  INVENTORY = '1200',
  FIXED_ASSETS = '1500',
  ACCUMULATED_DEPRECIATION = '1510',
  SUPPLIER_PAYABLES = '2000',
  TAX_PAYABLE = '2100',
  TIPS_PAYABLE = '2200',
  CUSTOMER_DEPOSITS = '2300',
  DEFERRED_REVENUE = '2400',
  ACCRUED_LIABILITIES = '2500',
  LONG_TERM_DEBT = '2600',
  OWNER_EQUITY = '3000',
  SERVICE_REVENUE = '4000',
  RENTAL_REVENUE = '4100',
  COGS = '5000',
  COST_OF_SERVICES = '5100',
  EXPENSE_RENT = '6000',
  EXPENSE_UTILITIES = '6010',
  EXPENSE_PAYROLL = '6020',
  EXPENSE_SUPPLIES = '6030',
  EXPENSE_MARKETING = '6040',
  EXPENSE_MAINTENANCE = '6050',
  EXPENSE_TAXES = '6060',
  EXPENSE_DEPRECIATION = '6070',
  EXPENSE_INTEREST = '6080',
  EXPENSE_OTHER = '6090',
}

export interface GlAccountSeed {
  code: GlAccountCode;
  name: string;
  type: GlAccountType;
  normalBalance: GlNormalBalance;
  /** current vs non-current presentation for ASSET/LIABILITY; null otherwise. */
  isCurrent: boolean | null;
  /** true for contra accounts (e.g. accumulated depreciation). */
  contra: boolean;
}

const A = GlAccountType;
const D = GlNormalBalance.DEBIT;
const C = GlNormalBalance.CREDIT;

export const GL_ACCOUNT_SEED: readonly GlAccountSeed[] = Object.freeze([
  {
    code: GlAccountCode.CASH,
    name: 'Cash',
    type: A.ASSET,
    normalBalance: D,
    isCurrent: true,
    contra: false,
  },
  {
    code: GlAccountCode.TENDER_CLEARING,
    name: 'Tender clearing',
    type: A.ASSET,
    normalBalance: D,
    isCurrent: true,
    contra: false,
  },
  {
    code: GlAccountCode.ACCOUNTS_RECEIVABLE,
    name: 'Accounts receivable',
    type: A.ASSET,
    normalBalance: D,
    isCurrent: true,
    contra: false,
  },
  {
    code: GlAccountCode.INVENTORY,
    name: 'Inventory',
    type: A.ASSET,
    normalBalance: D,
    isCurrent: true,
    contra: false,
  },
  {
    code: GlAccountCode.FIXED_ASSETS,
    name: 'Fixed assets',
    type: A.ASSET,
    normalBalance: D,
    isCurrent: false,
    contra: false,
  },
  {
    code: GlAccountCode.ACCUMULATED_DEPRECIATION,
    name: 'Accumulated depreciation',
    type: A.ASSET,
    normalBalance: C,
    isCurrent: false,
    contra: true,
  },
  {
    code: GlAccountCode.SUPPLIER_PAYABLES,
    name: 'Supplier payables',
    type: A.LIABILITY,
    normalBalance: C,
    isCurrent: true,
    contra: false,
  },
  {
    code: GlAccountCode.TAX_PAYABLE,
    name: 'Tax payable',
    type: A.LIABILITY,
    normalBalance: C,
    isCurrent: true,
    contra: false,
  },
  {
    code: GlAccountCode.TIPS_PAYABLE,
    name: 'Tips payable',
    type: A.LIABILITY,
    normalBalance: C,
    isCurrent: true,
    contra: false,
  },
  {
    code: GlAccountCode.CUSTOMER_DEPOSITS,
    name: 'Customer deposits',
    type: A.LIABILITY,
    normalBalance: C,
    isCurrent: true,
    contra: false,
  },
  {
    code: GlAccountCode.DEFERRED_REVENUE,
    name: 'Deferred revenue',
    type: A.LIABILITY,
    normalBalance: C,
    isCurrent: true,
    contra: false,
  },
  {
    code: GlAccountCode.ACCRUED_LIABILITIES,
    name: 'Accrued liabilities',
    type: A.LIABILITY,
    normalBalance: C,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.LONG_TERM_DEBT,
    name: 'Long-term debt',
    type: A.LIABILITY,
    normalBalance: C,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.OWNER_EQUITY,
    name: 'Owner equity',
    type: A.EQUITY,
    normalBalance: C,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.SERVICE_REVENUE,
    name: 'Service revenue',
    type: A.REVENUE,
    normalBalance: C,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.RENTAL_REVENUE,
    name: 'Rental revenue',
    type: A.REVENUE,
    normalBalance: C,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.COGS,
    name: 'Cost of goods sold',
    type: A.EXPENSE,
    normalBalance: D,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.COST_OF_SERVICES,
    name: 'Cost of services',
    type: A.EXPENSE,
    normalBalance: D,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.EXPENSE_RENT,
    name: 'Expense — rent',
    type: A.EXPENSE,
    normalBalance: D,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.EXPENSE_UTILITIES,
    name: 'Expense — utilities',
    type: A.EXPENSE,
    normalBalance: D,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.EXPENSE_PAYROLL,
    name: 'Expense — payroll',
    type: A.EXPENSE,
    normalBalance: D,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.EXPENSE_SUPPLIES,
    name: 'Expense — supplies',
    type: A.EXPENSE,
    normalBalance: D,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.EXPENSE_MARKETING,
    name: 'Expense — marketing',
    type: A.EXPENSE,
    normalBalance: D,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.EXPENSE_MAINTENANCE,
    name: 'Expense — maintenance',
    type: A.EXPENSE,
    normalBalance: D,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.EXPENSE_TAXES,
    name: 'Expense — taxes',
    type: A.EXPENSE,
    normalBalance: D,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.EXPENSE_DEPRECIATION,
    name: 'Expense — depreciation',
    type: A.EXPENSE,
    normalBalance: D,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.EXPENSE_INTEREST,
    name: 'Expense — interest',
    type: A.EXPENSE,
    normalBalance: D,
    isCurrent: null,
    contra: false,
  },
  {
    code: GlAccountCode.EXPENSE_OTHER,
    name: 'Expense — other',
    type: A.EXPENSE,
    normalBalance: D,
    isCurrent: null,
    contra: false,
  },
]);

const SEED_BY_CODE: ReadonlyMap<string, GlAccountSeed> = new Map(
  GL_ACCOUNT_SEED.map((account) => [account.code, account]),
);

/** Returns the seed metadata for a code, or undefined if the code is unknown. */
export function getGlAccountMeta(code: string): GlAccountSeed | undefined {
  return SEED_BY_CODE.get(code);
}

/** True when `code` is a known chart-of-accounts code. */
export function isGlAccountCode(code: string): code is GlAccountCode {
  return SEED_BY_CODE.has(code);
}

/**
 * Sign multiplier that converts a raw (debit − credit) figure into the account's
 * natural balance: +1 for debit-normal accounts, −1 for credit-normal accounts.
 * So a credit-normal liability with net credits returns a positive balance.
 */
export function normalBalanceSign(code: string): number {
  return getGlAccountMeta(code)?.normalBalance === GlNormalBalance.CREDIT
    ? -1
    : 1;
}
