import { cacheControlFor, noStoreAllFromEnv } from './cache-policy';

describe('cacheControlFor', () => {
  it('keeps admin reads out of every cache, as before', () => {
    expect(cacheControlFor('/api/admin/users?page=2')).toBe('no-store');
    expect(cacheControlFor('/api/admin')).toBe('no-store');
  });

  it('keeps the POS portal’s login, session and renewal off the disk', () => {
    expect(cacheControlFor('/api/pos-portal/auth/session')).toBe('no-store');
    expect(cacheControlFor('/api/pos-portal/auth/refresh')).toBe('no-store');
  });

  it('makes a signed-in POS or retail read ask the server before reusing a copy', () => {
    expect(
      cacheControlFor(
        '/api/pos/v1/school/lesson-plans?branchId=115&from=2026-10-05&to=2026-10-11&mine=1',
      ),
    ).toBe('private, no-cache');
    expect(cacheControlFor('/api/pos/v1/attendance/lessons?branchId=115')).toBe(
      'private, no-cache',
    );
    expect(cacheControlFor('/api/retail/v1/ops/stock-health?branchId=3')).toBe(
      'private, no-cache',
    );
  });

  it('does not let /api/pos swallow /api/pos-portal or /api/pos-sync', () => {
    expect(cacheControlFor('/api/pos-portal/auth/login')).toBe('no-store');
    expect(cacheControlFor('/api/pos-sync/receipts/verify/abc')).toBeNull();
    expect(cacheControlFor('/api/position')).toBeNull();
  });

  it('leaves the public catalogue and everything outside /api to the interceptor', () => {
    expect(cacheControlFor('/api/v1/categories')).toBeNull();
    expect(cacheControlFor('/api/consumer/v1/branches/9/catalog')).toBeNull();
    expect(cacheControlFor('/health')).toBeNull();
    expect(cacheControlFor('')).toBeNull();
    expect(cacheControlFor(undefined)).toBeNull();
  });

  it('reads a URL without its leading slash the way Express may hand it over', () => {
    expect(cacheControlFor('api/pos/v1/school/lesson-plans')).toBe(
      'private, no-cache',
    );
    expect(cacheControlFor('api/admin/users')).toBe('no-store');
  });

  it('makes a seller-workspace or supplier-hub read revalidate too', () => {
    expect(
      cacheControlFor('/api/seller/v1/reports/branches/81/profit-loss?from=x'),
    ).toBe('private, no-cache');
    expect(cacheControlFor('/api/hub/v1/purchase-orders/incoming')).toBe(
      'private, no-cache',
    );
  });

  it('turns the REST of the API to no-store on the existing switch', () => {
    expect(cacheControlFor('/api/v1/categories', { noStoreAll: true })).toBe(
      'no-store',
    );
    expect(cacheControlFor('/api/orders/mine', { noStoreAll: true })).toBe(
      'no-store',
    );
    expect(cacheControlFor('/health', { noStoreAll: true })).toBeNull();
  });

  it('the switch does not reach a signed-in POS, retail, seller or hub read', () => {
    // Production runs with the switch on. Before, it ran first and made every
    // POS poll no-store: no ETag, no 304, the full body every tick.
    for (const url of [
      '/api/pos/v1/register/suspended-carts?branchId=142&status=SUSPENDED',
      '/api/pos/v1/parked-orders?branchId=142',
      '/api/retail/v1/ops/branch-products?branchId=142',
      '/api/seller/v1/reports/branches/142/profit-loss',
      '/api/hub/v1/suppliers/me/financials/overview',
    ]) {
      expect(cacheControlFor(url, { noStoreAll: true })).toBe(
        'private, no-cache',
      );
    }
    expect(
      cacheControlFor('/api/pos-portal/auth/session', { noStoreAll: true }),
    ).toBe('no-store');
    expect(cacheControlFor('/api/admin/users', { noStoreAll: true })).toBe(
      'no-store',
    );
  });
});

describe('noStoreAllFromEnv', () => {
  it('accepts 1 and true in any case, nothing else', () => {
    expect(noStoreAllFromEnv('1')).toBe(true);
    expect(noStoreAllFromEnv('TRUE')).toBe(true);
    expect(noStoreAllFromEnv('true')).toBe(true);
    expect(noStoreAllFromEnv('0')).toBe(false);
    expect(noStoreAllFromEnv('')).toBe(false);
    expect(noStoreAllFromEnv(undefined)).toBe(false);
  });
});
