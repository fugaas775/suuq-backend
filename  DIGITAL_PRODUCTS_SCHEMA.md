# Digital Products Schema & Validation

## Canonical Structure

Digital product metadata lives inside `product.attributes.digital`.

```jsonc
{
  "digital": {
    "type": "digital",
    "isFree": true,               // optional, signals free public download
    "download": {
      "key": "files/book.pdf",  // object storage key (no host)
      "publicUrl": "https://<bucket>.<region>.digitaloceanspaces.com/files/book.pdf", // auto-derived
      "size": 123456,             // bytes (optional)
      "contentType": "application/pdf",
      "filename": "book.pdf",    // derived from key if omitted
      "checksum": "sha256:...",  // optional integrity value
      "licenseRequired": true,    // if true, license object must be present
      "license": {                // (phase 2) optional structured license
        "id": "mit",
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT"
      }
    }
  }
}
```

## Backward Compatibility
Legacy attributes supported during migration:
- `downloadKey` (string)
- `isFree` / `is_free` (boolean)
- `licenseRequired` / `license_required` (boolean)

These are normalized automatically into the canonical structure on load / create / update. Post-migration persistence removes legacy keys.

## Product Type
`product.productType` is inferred automatically if not provided:
- If `digital` structure present -> `digital`
- If property listing fields present -> `property`
- Else -> `physical`

Clients may still send `productType` explicitly.

## Validation Rules
Error codes emitted (wrapped in 403 Forbidden body `{ code, error }`):
- `DIGITAL_MISSING_STRUCTURE`
- `DIGITAL_INVALID_TYPE`
- `DIGITAL_MISSING_DOWNLOAD`
- `DIGITAL_MISSING_KEY`
- `DIGITAL_UNSUPPORTED_TYPE` (allowed: pdf, epub, zip)
- `DIGITAL_FILE_TOO_LARGE` ( >100MB )
- `DIGITAL_LICENSE_REQUIRED` (licenseRequired true but no license object)

## Public URL Guarantee
`/media/finalize` always returns a stable `publicUrl` (never signed). Only the `key` needs to be stored; the API auto-derives `publicUrl` if absent.

## Phase 2 License Object
`download.license` may contain `{ id, name, url }`. If `licenseRequired` is true and `license` missing, request is rejected.

## Monitoring
On create/update, if normalization changes attribute JSON, a debug log line is emitted. Add external log-based alerting to ensure no legacy keys (`downloadKey`, `isFree`, `licenseRequired`) persist after rollout.

## Migration Summary
Migration `1758000000000-AddProductTypeAndDigitalBackfill.ts`:
- Adds `product_type` column.
- Converts legacy keys into canonical digital structure.
- Backfills `product_type='digital'` when `downloadKey` detected.

## Client Guidance
1. Use direct upload flow to receive `{ key, putUrl, publicUrl }`.
2. After finalize, store only `download.key` (`publicUrl` optional).
3. For free products, set `digital.isFree=true` and price `0.00` if desired.
4. Provide `licenseRequired` & `license` if distribution constraints apply.

## Example Create Payload
```json
{
  "name": "E-Book: Learn NestJS",
  "price": 9.99,
  "currency": "USD",
  "productType": "digital",
  "attributes": {
    "digital": {
      "type": "digital",
      "isFree": false,
      "download": {
        "key": "ebooks/nestjs_guide_v1.pdf",
        "contentType": "application/pdf"
      }
    }
  }
}
```

## Example Error
```json
{
  "statusCode": 403,
  "message": { "error": "Digital download key not provided.", "code": "DIGITAL_MISSING_KEY" },
  "error": "Forbidden"
}
```
