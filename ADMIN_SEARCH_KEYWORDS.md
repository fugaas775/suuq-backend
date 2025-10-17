# Admin Search Keywords Feature

This document summarizes the existing implementation of the Search Keyword analytics feature exposed to the Admin Panel and proposes optional improvements.

## Overview
User search input (both live suggestions and submitted searches) is captured and aggregated in the `search_keyword` table. Admin endpoints expose:

- Listing with filtering/sorting
- Top keywords within rolling windows (day / week / month)
- Aggregations (top vendors, cities, countries) over a recent window

## Data Model (`search_keyword`)
| Column | Purpose |
| ------ | ------- |
| id | PK |
| q | Original captured query (truncated 256) |
| q_norm (`qNorm`) | Normalized (lowercased, collapsed spaces) – UNIQUE index |
| total_count | All events (suggest + submit) |
| suggest_count | Suggest (type-ahead) events |
| submit_count | Submitted (executed) searches |
| last_results | Result count for last submit (proxy for success) |
| last_ip / last_ua | Telemetry of last event |
| last_city / last_country | Geo metadata (most recent) |
| last_vendor_name | Vendor filter context of last event (if any) |
| vendor_hits | JSON array summarizing vendor distribution for last submit (e.g. `[ { name, id?, country?, count } ]`) |
| first_seen_at / last_seen_at | Timestamps for first + most recent observation |

Existing index: `IDX_search_keyword_qnorm` (UNIQUE on `q_norm`).

## Capture Flow
`ProductsController` calls `productsService.recordSearchKeyword()` for:
- Suggest endpoint (`GET /api/products/suggest?q=...`) with kind = `suggest`
- Search submit (primary listing endpoint) with kind = `submit` and enriched metadata (results length, geo, vendor, vendorHits)

`recordSearchKeyword()`:
1. Normalizes the input string.
2. Looks up existing row by `qNorm`.
3. Increments counters and updates metadata, or creates a new row.

## Admin Endpoints
Implemented in `AdminAnalyticsController` (guards: JWT + Roles ADMIN / SUPER_ADMIN):

### Listing
`GET /api/admin/search-keywords` (aliases: multiple resilient paths)
Query params:
- `page` (default 1)
- `perPage` (1..100, default 20)
- `from`, `to` (ISO date strings; filter by `lastSeenAt`)
- `minSubmits` (integer threshold on `submitCount`)
- `q` (substring filter on `q` or `qNorm` via ILIKE)
- `sort` (submit_desc | submit_asc | total_desc | total_asc | last_desc | last_asc)
- `city`, `country`, `vendor` (filter on recent metadata fields)

Returns: `{ items, total, page, perPage }` with each item extended with `vendorName`, `city`, `country`, `countryCode` (country derived from city when possible; restricted to ET, SO, KE, DJ).

### Top Keywords
`GET /api/admin/search-keywords/top?window=day|week|month&limit=...`
- Ranks by `submitCount` (tie-break: `totalCount`, then `lastSeenAt`).

### Summary
`GET /api/admin/search-keywords/top/summary`
- Bundles day/week/month top keywords and their aggregations.

### Aggregations
`GET /api/admin/search-keywords/aggregations?window=...&limit=...`
Returns:
- `vendors`: aggregated from `vendorHits` across keywords in the window (fallback heuristic if absent)
- `cities`: top cities by summed `submitCount` in window
- `countries`: restricted list (ET, SO, KE, DJ) with summed city submits + distinct vendor counts

## Current Strengths
- Resilient alias endpoints minimize client breakage.
- Lightweight single-table aggregation (no external dependency).
- Vendor/city/country enrichment for insight.
- Windowed views computed on demand.

## Identified Gaps / Risks
1. Concurrency: Read-modify-write pattern on increments can lose updates under high parallel load.
2. Missing supporting indexes for frequent filters/sorts (`submit_count`, `last_seen_at`, substring ILIKE on `q_norm`).
3. No explicit metric for "no result" searches beyond inspecting `last_results == 0` (only last event captured, not cumulative count).
4. Aggregation queries recompute on every request (possible caching win for admin dashboards).
5. Potential unbounded growth of table (no archival strategy; suggest periodic compaction or aging strategy for very stale rows).
6. `vendor_hits` only reflects the last submit for a keyword, not an accumulated distribution—may be misleading.
7. ILIKE `%...%` on large table will degrade without trigram or GIN index.

## Recommended Improvements (Optional)
| Priority | Item | Description |
| -------- | ---- | ----------- |
| High | Atomic upsert | Replace find/save with single `INSERT ... ON CONFLICT DO UPDATE` with counter increments. |
| High | Indexes | Add btree indexes: `(submit_count DESC)`, `(last_seen_at DESC)`, `(last_city)`, `(last_vendor_name)`, and trigram GIN on `q_norm` (and perhaps `q`). |
| Medium | Caching | Cache top keywords & aggregations for short TTL (e.g. 30–60s) in Redis. |
| Medium | No result count | Add `no_result_count` column incremented when `results === 0`. |
| Medium | Historical vendor distribution | Maintain cumulative vendor distribution table or JSON merge (could explode in size; consider summary table). |
| Low | Archival | Periodically snapshot and prune very low activity rows older than X months. |

## Example Atomic Upsert (Pseudo-SQL)
```sql
INSERT INTO search_keyword (q, q_norm, total_count, suggest_count, submit_count, last_results, last_ip, last_ua, last_city, last_vendor_name, last_country, vendor_hits)
VALUES ($1, $2, 1, CASE WHEN $3='suggest' THEN 1 ELSE 0 END, CASE WHEN $3='submit' THEN 1 ELSE 0 END, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (q_norm)
DO UPDATE SET
  total_count = search_keyword.total_count + 1,
  suggest_count = search_keyword.suggest_count + (CASE WHEN EXCLUDED.suggest_count = 1 THEN 1 ELSE 0 END),
  submit_count = search_keyword.submit_count + (CASE WHEN EXCLUDED.submit_count = 1 THEN 1 ELSE 0 END),
  last_results = EXCLUDED.last_results,
  last_ip = EXCLUDED.last_ip,
  last_ua = EXCLUDED.last_ua,
  last_city = EXCLUDED.last_city,
  last_vendor_name = EXCLUDED.last_vendor_name,
  last_country = EXCLUDED.last_country,
  vendor_hits = EXCLUDED.vendor_hits,
  last_seen_at = now();
```

## Suggested Index Migration (Sample)
```ts
await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_search_keyword_submit_count" ON "search_keyword" (submit_count DESC, last_seen_at DESC)');
await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_search_keyword_last_seen_at" ON "search_keyword" (last_seen_at DESC)');
await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_search_keyword_last_city" ON "search_keyword" (last_city)');
await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_search_keyword_last_vendor_name" ON "search_keyword" (last_vendor_name)');
// Requires pg_trgm extension
await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_search_keyword_qnorm_trgm" ON "search_keyword" USING GIN (q_norm gin_trgm_ops)');
```
(Ensure the `pg_trgm` extension is installed: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`.)

## Admin UI Usage Guide
1. Use `/api/admin/search-keywords?minSubmits=2&sort=submit_desc` for table view with pagination.
2. Show sparkline or relative activity based on `submitCount` vs `totalCount` ratio.
3. Show last seen age (now - `lastSeenAt`) to highlight trending vs dormant keywords.
4. Pull `/api/admin/search-keywords/top/summary` once every 30–60s for dashboard cards.
5. Use aggregations endpoint to populate vendor/city/country insight panels.

## Edge Cases
- Very short queries (< 2 chars) ignored to reduce noise.
- Rapid repeated searches race: without atomic upsert, some increments may be lost (improvement recommended).
- IP / UA truncated for storage; not reliable for exact uniqueness.
- Country derivation limited to explicit set for display (ET, SO, KE, DJ). Others appear via raw `last_country` value.

## Future Enhancements
- Add anomaly detection (sudden spikes) via scheduled job.
- Add `first_submit_at` / `last_submit_at` columns for more precise submit window stats.
- Introduce a materialized view for top keywords (REFRESH FAST schedule) if table grows large.
- Provide export (CSV) endpoint with server-side streaming.

---
Maintainer Notes: This doc should stay updated if schema or endpoint behavior evolves.
