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

  it('turns the whole API to no-store on the existing switch', () => {
    expect(cacheControlFor('/api/v1/categories', { noStoreAll: true })).toBe(
      'no-store',
    );
    expect(cacheControlFor('/health', { noStoreAll: true })).toBeNull();
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
