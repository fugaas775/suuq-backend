# Home Feed V2 Geo Contract — Flutter QA Handoff (2026-02-25)

Environment verified: **production**
Base URL: `https://api.suuq.ugasfuad.com`
Endpoint: `GET /api/v2/home/feed`

## Contract Status

Backend contract is live on production and returns:
- `meta.requestId`
- `meta.refreshReason`
- `meta.geoScopeUsed`
- `meta.rotationBucket`
- `meta.rankingTierCounts`

Telemetry log event is also live:
- `home_feed_explore_fetch` with matching `requestId`, `reason`, `geoScopeUsed`, `tiers`.

## QA Matrix (Executed)

Common params used:
- `page=1`
- `per_page=8`
- `rotation_key=backend-qa-20260225`
- `time_bucket=2026-02-25T11:00:00.000Z`
- `session_salt=qa-salt`
- `geo_country_strict=true`

### 1) Ethiopia / Addis Ababa
- `request_id=qa-et-addis`
- `refresh_reason=qa_matrix`
- `geo_append=true`
- Observed:
  - `meta.geoScopeUsed=city_country`
  - `meta.rankingTierCounts={city_country:8, region_country:0, country_only:0, geo_append:0}`
  - `exploreProducts.items.length=8`

### 2) Ethiopia / Hawassa
- `request_id=qa-et-hawassa`
- `refresh_reason=qa_matrix`
- `geo_append=true`
- Observed:
  - `meta.geoScopeUsed=city_country`
  - `meta.rankingTierCounts={city_country:8, region_country:0, country_only:0, geo_append:0}`
  - `exploreProducts.items.length=8`

### 3) Kenya / Nairobi
- `request_id=qa-ke-nairobi`
- `refresh_reason=qa_matrix`
- `geo_append=true`
- Observed:
  - `meta.geoScopeUsed=none`
  - `meta.rankingTierCounts={city_country:0, region_country:0, country_only:0, geo_append:0}`
  - `exploreProducts.items.length=0`

### 4) Ethiopia / Addis (geo_append disabled)
- `request_id=qa-et-addis-noappend`
- `refresh_reason=qa_matrix`
- `geo_append=false`
- Observed:
  - `meta.geoScopeUsed=city_country`
  - `meta.rankingTierCounts={city_country:8, region_country:0, country_only:0, geo_append:0}`
  - `exploreProducts.items.length=8`

### 5) USA (country only)
- `request_id=qa-us-none`
- `refresh_reason=qa_matrix`
- `geo_append=true`
- Observed:
  - `meta.geoScopeUsed=none`
  - `meta.rankingTierCounts={city_country:0, region_country:0, country_only:0, geo_append:0}`
  - `exploreProducts.items.length=0`

## Differentiation Check

Top-8 overlap:
- ET Addis vs ET Hawassa: **1/8** overlap (differentiated ordering)
- ET Addis vs KE Nairobi: **0/8**
- ET Hawassa vs KE Nairobi: **0/8**

## Flutter QA Pass Criteria

1. Flutter request includes:
   - `user_country`, optional `user_region`/`user_city`
   - `rotation_key`, `time_bucket`, `session_salt`
   - `refresh_reason`, `request_id`
   - `geo_append`, `geo_country_strict`
2. Flutter parses and surfaces `meta` fields from response.
3. Same-country different-city requests produce overlapping but not identical top ordering.
4. `request_id` in client logs can be correlated with backend telemetry logs.

## Notes

- Staging hostname remains unresolved in current environment; this handoff is production-validated.
- For staging validation, provide a resolvable staging API FQDN and rerun the same matrix.
