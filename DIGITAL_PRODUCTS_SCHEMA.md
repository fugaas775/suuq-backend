# Digital products schema and read/write aliases

This document describes the canonical structure for digital products (e.g., PDFs, EPUBs, ZIPs), accepted write-time conveniences, and read-time alias backfills to keep client apps compatible.

## Canonical attributes shape (server-side)

- attributes.digital
  - type: 'digital'
  - isFree?: boolean
  - download
    - key: string                 # Spaces object key, required
    - publicUrl?: string          # derived from key and env; stable public URL
    - filename?: string           # from key
    - contentType?: string        # inferred from extension (pdf/epub/zip)
    - size?: number               # bytes; may be set from fileSizeMB alias
    - licenseRequired?: boolean   # if a license is required for download

Example:

{
  "digital": {
    "type": "digital",
    "isFree": false,
    "download": {
      "key": "downloads/file.pdf",
      "publicUrl": "https://<bucket>.<region>.digitaloceanspaces.com/downloads/file.pdf",
      "filename": "file.pdf",
      "contentType": "application/pdf",
      "size": 7486833,
      "licenseRequired": true
    }
  }
}

## Accepted write-time conveniences

- attributes.downloadKey: string → mapped to digital.download.key
- attributes.downloadUrl: string → server derives key if URL points to configured Spaces bucket
- attributes.isFree: boolean → mapped to digital.isFree
- attributes.fileSizeMB: number → converted to digital.download.size bytes
- attributes.licenseRequired: boolean → mirrored into digital.download.licenseRequired

Top-level equivalents are also accepted on create/update DTOs:
- downloadKey, downloadUrl, isFree

## Read-time alias backfills (for prefill)

To make edit screens and legacy clients work without immediate schema migration, the server backfills these aliases when returning a product:
- attributes.downloadUrl ← digital.download.publicUrl (or built from key)
- attributes.downloadKey ← digital.download.key
- attributes.format ← inferred from key extension: PDF/EPUB/ZIP
- attributes.fileSizeMB ← digital.download.size converted to MB (2 decimals)
- attributes.licenseRequired ← digital.download.licenseRequired

These aliases are additive and do not replace the canonical structure. Once all clients read `attributes.digital`, aliases can be gated by `FEATURE_FLAG_DIGITAL_ALIAS_REMOVE`.

## URL-to-key derivation (Spaces)

The server supports:
- Virtual-hosted: <bucket>.<region>.digitaloceanspaces.com/<key>
- Path-style: <region>.digitaloceanspaces.com/<bucket>/<key>
- CDN subdomain equivalents
- Custom endpoint from DO_SPACES_ENDPOINT

If an incoming URL matches the configured bucket/region/endpoint, the object key is extracted and used as the canonical `digital.download.key`.

## Validation

When `productType` resolves to 'digital', the server validates:
- digital exists and download.key is a non-empty string
- extension is among [pdf, epub, zip]
- optional size does not exceed configured max (100MB default)
- if licenseRequired is true and no license object is provided, request is rejected with code DIGITAL_LICENSE_REQUIRED

## Free downloads

- Public free-download endpoint requires attributes.isFree (or digital.isFree) and attributes.downloadKey (or derivable via downloadUrl).
- Returns a short-lived, signed attachment URL from Spaces with proper content type and filename.

## Migration notes

- Legacy records with only { isFree: false } will not have digital metadata; update them via PATCH to include downloadKey or downloadUrl.
- Prefer providing a Spaces object key; URLs are accepted for convenience.
