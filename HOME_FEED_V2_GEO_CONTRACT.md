# Home Feed V2 Geo + Rotation Contract

Endpoint: `GET /api/v2/home/feed`

Purpose: keep Home relevant by geo while allowing deterministic revisit diversification and silent refresh telemetry.

## Request Query

### Core pagination
- `page` (optional, default: `1`)
- `limit` or `per_page` (optional, default: `20`, max: `50`)

### Geo context
- `user_country` / `userCountry` / `country` (recommended; backend treats as strict country scope by default)
- `user_region` / `userRegion` / `region` (optional)
- `user_city` / `userCity` / `city` (optional)
- `geo_append` / `geoAppend` (optional, default: `true`)
- `geo_country_strict` / `geoCountryStrict` (optional, default: `true`)

### Revisit diversification + refresh telemetry
- `rotation_key` / `rotationKey` / `seed` (optional; stable seed input)
- `time_bucket` / `timeBucket` (optional; if absent backend infers 10-minute bucket)
- `session_salt` / `sessionSalt` (optional)
- `refresh_reason` / `refreshReason` (optional; e.g. `initial_load`, `pull_to_refresh`, `tab_switch_all`, `revisit_resume`, `currency_change`)
- `request_id` / `requestId` (optional; if absent backend generates one)

### Existing filters retained
- `categoryId`, `category`, `categories`, `categorySlug`
- `category_first` / `categoryFirst`
- `include_descendants` / `includeDescendants`
- `sort`
- `listing_type` / `listingType`
- `listing_type_mode` / `listingTypeMode`
- `currency`

## Ranking + Fallback Behavior

Backend explore assembly follows these tiers, deduped, until `perPage` is filled:
1. `city_country`
2. `region_country`
3. `country_only`
4. `geo_append`

Deterministic ordering inside the listing query uses:
1. geo rank (country/city/region priority)
2. rotation rank (derived from product id + rotation seed)
3. freshness (`createdAt DESC`) for final tie-breaks

Country strictness is enabled by default and supports country code/full-name variants for:
- Ethiopia (`ET`, `ETHIOPIA`)
- Somalia (`SO`, `SOMALIA`)
- Kenya (`KE`, `KENYA`)
- Djibouti (`DJ`, `DJIBOUTI`)
- USA (`US`, `USA`, `UNITED STATES`, `UNITED STATES OF AMERICA`)

## Response Additions

Existing payload keys remain unchanged. New diagnostics live under `meta`:

```json
{
  "meta": {
    "requestId": "req-123",
    "refreshReason": "revisit_resume",
    "geoScopeUsed": "city_country",
    "rotationBucket": "2026-02-25T10:00:00.000Z",
    "rankingTierCounts": {
      "city_country": 8,
      "region_country": 4,
      "country_only": 3,
      "geo_append": 0
    }
  }
}
```

## Flutter Guidance

- Always send `user_country`; send `user_region`/`user_city` when available.
- Keep `geo_append=true` and `geo_country_strict=true` unless debugging fallback behavior.
- Use stable revisit metadata across one revisit window:
  - fixed `rotation_key` + `session_salt`
  - bucketed `time_bucket` (10-minute windows recommended)
- Pass semantic `refresh_reason` for observability.
- Provide a client-generated `request_id` for easier cross-log tracing.

## Compatibility Notes

- Old clients remain compatible: missing new params still works.
- `meta` is additive and safe for clients that ignore unknown fields.
- Legacy aliases (`user_city`, `user_region`, `user_country`, etc.) continue to be accepted.
