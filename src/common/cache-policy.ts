/**
 * What a browser (or a proxy) may do with a response, decided by the URL
 * before any controller runs. The global EtagInterceptor stamps
 * `Cache-Control: public, max-age=300` on every 2xx GET that does not set
 * its own header, and a browser honours that for a fetch() exactly as it
 * does for an image: the same URL asked again inside five minutes is served
 * from its own copy, no request made. Fine for a public catalogue. Wrong
 * for anything a signed-in person reads right after writing it: a teacher
 * saved a lesson plan, the portal re-read the week, and the browser handed
 * back the list from before the save — "no plan" for five minutes.
 *
 * - `/api/admin`      → no-store (as before: never kept anywhere).
 * - `/api/pos-portal` → no-store: login, session and token renewal carry
 *                       credentials; nothing of theirs belongs on a disk.
 * - `/api/pos`, `/api/retail` → private, no-cache: the browser may keep its
 *                       copy but must ask the server before using it. The
 *                       interceptor still sets the ETag and answers a
 *                       matching If-None-Match with a 304, so a slow link
 *                       pays headers, not the payload, when nothing changed.
 *
 * `NO_STORE_ALL_API` (an existing switch) still turns the whole API to
 * no-store. Pure: the URL in, the header value (or null) out.
 */
const NO_STORE_PREFIXES = ['/api/admin', '/api/pos-portal'];
const REVALIDATE_PREFIXES = ['/api/pos', '/api/retail'];

const pathOf = (url: unknown): string => {
  const raw = String(url ?? '');
  const cut = raw.search(/[?#]/);
  const path = cut >= 0 ? raw.slice(0, cut) : raw;
  return path.startsWith('/') ? path : `/${path}`;
};

/** `/api/pos` matches `/api/pos` and `/api/pos/...`, never `/api/pos-portal`. */
const underPrefix = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

export function cacheControlFor(
  url: unknown,
  { noStoreAll = false }: { noStoreAll?: boolean } = {},
): string | null {
  const path = pathOf(url);
  if (!underPrefix(path, '/api')) return null;
  if (noStoreAll) return 'no-store';
  if (NO_STORE_PREFIXES.some((p) => underPrefix(path, p))) return 'no-store';
  if (REVALIDATE_PREFIXES.some((p) => underPrefix(path, p))) {
    return 'private, no-cache';
  }
  return null;
}

/** The environment's word on the switch: '1' or 'true', any case. */
export function noStoreAllFromEnv(
  value: string | undefined = process.env.NO_STORE_ALL_API,
): boolean {
  const v = String(value ?? '').toLowerCase();
  return v === '1' || v === 'true';
}
