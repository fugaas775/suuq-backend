import * as dotenv from 'dotenv';

dotenv.config({ quiet: true });

const STARPAY_API_BASE_PATH = '/v1/starpay-api';
const STARPAY_TRDP_PREFIX = '/trdp';

const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizePath = (value: string | undefined, fallback: string): string => {
  const path = String(value || fallback).trim();
  if (!path) {
    return fallback;
  }

  return path.startsWith('/') ? path : `/${path}`;
};

const normalizeBaseUrl = (value: string | undefined): string | undefined => {
  const raw = String(value || '')
    .trim()
    .replace(/\/+$/, '');
  if (!raw) {
    return undefined;
  }

  if (raw.endsWith(`${STARPAY_API_BASE_PATH}${STARPAY_TRDP_PREFIX}`)) {
    return raw.slice(0, -STARPAY_TRDP_PREFIX.length);
  }

  return raw;
};

const normalizeTrdpPath = (
  value: string | undefined,
  fallback: string,
): string => {
  let path = normalizePath(value, fallback);

  if (path.startsWith(`${STARPAY_API_BASE_PATH}${STARPAY_TRDP_PREFIX}/`)) {
    path = path.slice(STARPAY_API_BASE_PATH.length);
  } else if (path.startsWith(STARPAY_API_BASE_PATH + '/')) {
    path = path.slice(STARPAY_API_BASE_PATH.length);
  }

  if (!path.startsWith(`${STARPAY_TRDP_PREFIX}/`)) {
    path = path.replace(/^\/+/, '');
    path = path.startsWith('trdp/')
      ? `/${path}`
      : `${STARPAY_TRDP_PREFIX}/${path}`;
  }

  return path;
};

export const starpayConfig = {
  merchantName: process.env.STARPAY_MERCHANT_NAME,
  merchantId: process.env.STARPAY_MERCHANT_ID,
  secretKey: process.env.STARPAY_SECRET_KEY,
  baseUrl: normalizeBaseUrl(process.env.STARPAY_BASE_URL),
  callbackSecret: process.env.CALLBACK_SECRET,
  timeoutMs: parseInteger(process.env.STARPAY_TIMEOUT_MS, 30000),
  authMode: String(process.env.STARPAY_AUTH_MODE || 'x-api-key')
    .trim()
    .toLowerCase(),
  authScheme: String(process.env.STARPAY_AUTH_SCHEME || 'Bearer').trim(),
  secretHeaderName: String(
    process.env.STARPAY_SECRET_HEADER_NAME || 'x-api-secret',
  ).trim(),
  merchantIdHeaderName: String(
    process.env.STARPAY_MERCHANT_ID_HEADER_NAME || 'x-merchant-id',
  ).trim(),
  merchantNameHeaderName: String(
    process.env.STARPAY_MERCHANT_NAME_HEADER_NAME || 'x-merchant-name',
  ).trim(),
  sdkModule: String(process.env.STARPAY_SDK_MODULE || '').trim() || null,
  sdkExportName: String(
    process.env.STARPAY_SDK_EXPORT_NAME || 'default',
  ).trim(),
  signatureHeaderName: String(
    process.env.STARPAY_SIGNATURE_HEADER_NAME || 'x-signature',
  ).trim(),
  timestampHeaderName: String(
    process.env.STARPAY_TIMESTAMP_HEADER_NAME || 'x-timestamp',
  ).trim(),
  webhookToleranceMs: parseInteger(
    process.env.STARPAY_WEBHOOK_TOLERANCE_MS,
    300000,
  ),
  sandboxMode:
    String(process.env.STARPAY_SANDBOX_MODE || '').trim() === 'true' ||
    String(normalizeBaseUrl(process.env.STARPAY_BASE_URL) || '')
      .toLowerCase()
      .includes('qa'),
  sandboxTestMsisdn: String(
    process.env.STARPAY_SANDBOX_TEST_MSISDN || '00000000600',
  ).trim(),
  endpoints: {
    verifyPayment: normalizeTrdpPath(
      process.env.STARPAY_VERIFY_PAYMENT_PATH,
      '/trdp/verify',
    ),
    bankPayment: normalizeTrdpPath(
      process.env.STARPAY_BANK_PAYMENT_PATH,
      '/trdp/bank/initiate',
    ),
    walletPayment: normalizeTrdpPath(
      process.env.STARPAY_WALLET_PAYMENT_PATH,
      '/trdp/wallet/initiate',
    ),
    dynamicQr: normalizeTrdpPath(
      process.env.STARPAY_DYNAMIC_QR_PATH,
      '/trdp/qr/dynamic',
    ),
    createService: normalizeTrdpPath(
      process.env.STARPAY_CREATE_SERVICE_PATH,
      '/trdp/billing/services',
    ),
    createBill: normalizeTrdpPath(
      process.env.STARPAY_CREATE_BILL_PATH,
      '/trdp/billing/bills',
    ),
    eodReport: normalizeTrdpPath(
      process.env.STARPAY_EOD_REPORT_PATH,
      '/trdp/reports/eod',
    ),
    balanceHistory: normalizeTrdpPath(
      process.env.STARPAY_BALANCE_HISTORY_PATH,
      '/trdp/accounts/e-money/balance-history',
    ),
    settlements: normalizeTrdpPath(
      process.env.STARPAY_SETTLEMENTS_PATH,
      '/trdp/settlements',
    ),
  },
};

export type StarpayConfig = typeof starpayConfig;
