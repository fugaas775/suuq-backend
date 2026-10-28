/**
 * The version of one page of a branch's held-cart list, as an ETag.
 *
 * Every register polls this list every few seconds for the whole shift, and
 * nearly every answer is the one it already holds. The global ETag
 * interceptor would answer a matching If-None-Match with a 304 — after
 * loading every row, mapping it and hashing the JSON. This version is read
 * instead from one aggregate over the same WHERE: how many rows the scope
 * holds and when the newest of them last changed. Any write that reaches
 * the list moves one of the two: a row added or taken out of the scope
 * moves the count (a row discarded and one parked in the same instant moves
 * the latest write), and a row edited moves `updatedAt`. The page and its
 * size ride along so one URL's tag can never stand for another's.
 */
export function suspendedCartsListEtag(input: {
  count: number | string | null | undefined;
  latest: Date | string | number | null | undefined;
  page: number;
  perPage: number;
}): string {
  const count = Number(input.count ?? 0) || 0;
  return `W/"sc-${count}-${toMillis(input.latest)}-${input.page}-${input.perPage}"`;
}

function toMillis(value: Date | string | number | null | undefined): number {
  if (value == null || value === '') return 0;
  const ms =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Does the request's If-None-Match name this tag (weak or strong, any of a list)? */
export function etagMatches(
  ifNoneMatch: string | string[] | undefined | null,
  etag: string,
): boolean {
  if (!ifNoneMatch || !etag) return false;
  const raw = Array.isArray(ifNoneMatch)
    ? ifNoneMatch.join(',')
    : String(ifNoneMatch);
  const bare = (tag: string) => tag.trim().replace(/^W\//, '');
  const wanted = bare(etag);
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .some((tag) => tag === '*' || bare(tag) === wanted);
}
