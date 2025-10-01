# Product Listing Engine

This module provides a modular, strategy-based product listing pipeline:

- Input normalization via `ProductListingDto`
- Filter strategies (search, vendor, tags, price, property, category)
- Geo-aware augmenters (geo priority ranking, distance computation/radius)
- Sort strategies (created, rating, sales, price, views, best_match, distance)
- Pagination strategies (default, category-first union with optional geo top-up)
- Optional mapping to lean product cards for grid view

## Add a new filter

- Create a file under `strategies/filtering/your.filter.ts`
- Implement `IFilterStrategy` with `apply(q, dto)` and mutate the QueryBuilder
- Register it in `product-listing.service.ts` in the `filters` array at an appropriate position

## Add a new sort

- Create under `strategies/sorting/your.sort.ts`
- Implement `ISortStrategy` and add to the `sortMap` in `product-listing.service.ts`
- If the sort should respect geo priority, consider prefacing with `orderBy('geo_rank', 'DESC')` when `dto.geoPriority` is true

## Category-first pagination

Use `dto.categoryFirst=true` along with `dto.categoryId` (or slug via CategoryFilter) to return items from the category subtree first, then fill from outside. When `dto.geoAppend=true`, any underfilled page is topped up with globally ordered items using the base query ordering.

Strict mode: set `dto.strictCategory=true` (or pass `strict_category=1` in query) to disable fallback. In strict mode the paginator:

- returns only items whose category is in the in-scope category IDs
- does not include items from other categories
- skips geoAppend top-up

Note: When `includeDescendants=false` is provided alongside `categoryFirst=true`, strict mode is implicitly enabled.

### Strict-empty → parent fallback (opt-in)

To mirror client behavior with a thinner client, you can opt-in to a server-side fallback when a strict query returns zero items:

- `strict_empty_fallback_parent_id=<id>`: parent category id to fallback to
- `fallback_descendants=1` (default): include all descendants of the parent

Behavior: The service re-runs the request with `categoryFirst=true`, `strict=false`, the parent scope (expanding descendants if enabled), and allows `geoAppend` to top up underfilled pages. Original strict response remains unchanged when items exist; fallback only engages on strict-empty.

### Debug aides

Pass `debug_listing=1` to receive additional metadata:

- Response includes a `debug.meta` object with `{ usedOthers, geoFilled, fallbackToParent? }`.
- v1 controller also emits headers when debug is on:
	- `X-Listing-Used-Others`
	- `X-Listing-Geo-Filled`
	- `X-Listing-Fallback-Parent`

## Distance and radius

When `dto.lat`/`dto.lng` are provided, the engine computes `distance_km` (Haversine) and optionally applies a radius filter (`dto.radiusKm`). You can then sort by `distance_asc` or `distance_desc`.

## Best match

`sort=best_match` applies a relevance order: geo rank (if `geoPriority`), then sales, rating, recency.

## Mapping to product cards

Call `ProductListingService.list(dto, { mapCards: true })` for grid view to get items already mapped to the lean product card shape, so controllers can be simpler.

## Testing

Strategy units can be tested with a fake `SelectQueryBuilder` that records operations. See tests under `strategies/**/__tests__` and `pagination/**/__tests__`.
