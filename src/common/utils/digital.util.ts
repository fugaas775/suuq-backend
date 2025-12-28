/* eslint-disable no-empty */

export interface DigitalDownloadMeta {
  key: string; // object key in Spaces
  publicUrl?: string; // stable public URL (derived if missing)
  size?: number; // bytes (optional, may be filled by head)
  contentType?: string; // MIME
  filename?: string; // original filename
  checksum?: string; // optional integrity value (e.g., sha256:abcd)
  licenseRequired?: boolean; // backward compat; if true and license missing validation may fail
  license?: { id?: string; name?: string; url?: string } | null; // phase 2 structure
}

export interface DigitalAttributesSchema {
  type: 'digital';
  isFree?: boolean; // convenience for free downloads
  download: DigitalDownloadMeta;
}

export interface NormalizeResult {
  updated: Record<string, any>;
  changed: boolean;
  inferredType?: 'digital';
}

// Allowed file extensions for digital downloads
const ALLOWED_EXT = new Set(['pdf', 'epub', 'zip']);

/** Infer file metadata from key if possible */
function inferFromKey(key: string): {
  filename?: string;
  contentType?: string;
} {
  const filename = key.split('/').pop();
  if (!filename) return {};
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return { filename };
  const contentType =
    ext === 'pdf'
      ? 'application/pdf'
      : ext === 'epub'
        ? 'application/epub+zip'
        : ext === 'zip'
          ? 'application/zip'
          : undefined;
  return { filename, contentType };
}

/**
 * Normalize legacy attributes into canonical digital schema.
 * Supports legacy root-level: downloadKey, isFree.
 */
export function normalizeDigitalAttributes(
  attrs: Record<string, any>,
): NormalizeResult {
  let changed = false;
  const updated: Record<string, any> = { ...attrs };

  // Already canonical?
  if (updated.digital && typeof updated.digital === 'object') {
    const dig = updated.digital as DigitalAttributesSchema;
    if (dig.download && typeof dig.download === 'object' && dig.download.key) {
      // Merge legacy licenseRequired at root or under digital into download metadata if not present
      const legacyLicenseReq =
        updated.licenseRequired === true ||
        (dig as any).licenseRequired === true;
      if (legacyLicenseReq && !dig.download.licenseRequired) {
        dig.download.licenseRequired = true;
        changed = true;
      }
      // Ensure publicUrl present
      if (!dig.download.publicUrl && dig.download.key) {
        try {
          const bucket = process.env.DO_SPACES_BUCKET;
          const region = process.env.DO_SPACES_REGION;
          if (bucket && region) {
            dig.download.publicUrl = `https://${bucket}.${region}.digitaloceanspaces.com/${dig.download.key}`;
            changed = true;
          }
        } catch {}
      }
      // ------------------------------------------------------------------
      // Legacy alias backfill for early frontend prefill (non-breaking)
      // These aliases let older clients (and in-flight edit screens) read
      // the canonical digital schema without waiting for a second fetch.
      // They are safe to remove once all clients consume attributes.digital
      // directly. Track via FEATURE_FLAG_DIGITAL_ALIAS_REMOVE env if needed.
      const removeAliases =
        process.env.FEATURE_FLAG_DIGITAL_ALIAS_REMOVE === 'true';
      let aliasAdded = false;
      if (!removeAliases) {
        // downloadUrl alias -> digital.download.publicUrl (fallback to derived URL via key)
        const existingDownloadUrl = updated.downloadUrl || updated.download_url;
        const candidateUrl = dig.download.publicUrl;
        if (!existingDownloadUrl && candidateUrl) {
          updated.downloadUrl = candidateUrl;
          aliasAdded = true;
        }
        // format alias -> infer from key extension (uppercased like PDF/EPUB/ZIP)
        if (!updated.format) {
          const ext = (dig.download.key.split('.').pop() || '').toLowerCase();
          if (ext === 'pdf' || ext === 'epub' || ext === 'zip') {
            updated.format = ext.toUpperCase();
            aliasAdded = true;
          }
        }
        // fileSizeMB alias -> convert bytes if size provided and reasonable
        if (dig.download.size && !updated.fileSizeMB) {
          const mb = dig.download.size / (1024 * 1024);
          if (isFinite(mb) && mb > 0) {
            updated.fileSizeMB = Math.round(mb * 100) / 100;
            aliasAdded = true;
          }
        }
        // licenseRequired legacy ( bool ) at root for quick toggle access
        if (
          typeof dig.download.licenseRequired === 'boolean' &&
          typeof updated.licenseRequired === 'undefined'
        ) {
          updated.licenseRequired = dig.download.licenseRequired;
          aliasAdded = true;
        }
      } else {
        // Optional cleanup path when feature flag enabled
        if ('downloadUrl' in updated) {
          delete updated.downloadUrl;
          changed = true;
        }
        if ('download_url' in updated) {
          delete updated.download_url;
          changed = true;
        }
        if ('format' in updated) {
          delete updated.format;
          changed = true;
        }
        if ('fileSizeMB' in updated) {
          delete updated.fileSizeMB;
          changed = true;
        }
        if ('licenseRequired' in updated) {
          delete updated.licenseRequired;
          changed = true;
        }
      }
      if (aliasAdded) changed = true;
      return { updated, changed, inferredType: 'digital' };
    }
  }

  const downloadKey = updated.downloadKey || updated.download_key || undefined;
  // Try deriving a key from a provided downloadUrl alias when present
  const urlToKeyIfInSpaces = (url: string): string | null => {
    try {
      const u = new URL(url);
      const bucket = (process.env.DO_SPACES_BUCKET || '').toLowerCase();
      const region = (process.env.DO_SPACES_REGION || '').toLowerCase();
      if (!bucket || !region) return null;
      const host = u.host.toLowerCase();
      const path = u.pathname.startsWith('/')
        ? u.pathname.slice(1)
        : u.pathname;
      const expectedVirtual = `${bucket}.${region}.digitaloceanspaces.com`;
      const expectedCdnVirtual = `${bucket}.${region}.cdn.digitaloceanspaces.com`;
      const regionHost = `${region}.digitaloceanspaces.com`;
      const cdnRegionHost = `${region}.cdn.digitaloceanspaces.com`;
      // Virtual-hosted: bucket.region.digitaloceanspaces.com/<key>
      if (host === expectedVirtual || host === expectedCdnVirtual) {
        return path || null;
      }
      // Path-style: region.digitaloceanspaces.com/<bucket>/<key>
      if (host === regionHost || host === cdnRegionHost) {
        if (path.startsWith(`${bucket}/`))
          return path.slice(bucket.length + 1) || null;
      }
      // Custom endpoint support
      try {
        const endpointHost = new URL(
          String(process.env.DO_SPACES_ENDPOINT || ''),
        ).host.toLowerCase();
        if (endpointHost && host === endpointHost) {
          if (path.startsWith(`${bucket}/`))
            return path.slice(bucket.length + 1) || null;
        }
      } catch {}
      return null;
    } catch {
      return null;
    }
  };
  // Find a Spaces URL in common alias shapes to derive key
  const pickUrlCandidate = (): string | undefined => {
    const cands: any[] = [];
    if (typeof (updated as any).downloadUrl === 'string')
      cands.push((updated as any).downloadUrl);
    if (typeof (updated as any).download_url === 'string')
      cands.push((updated as any).download_url);
    const file = (updated as any).file;
    if (file && typeof file === 'object') {
      if (typeof file.url === 'string') cands.push(file.url);
      if (typeof file.src === 'string') cands.push(file.src);
      if (Array.isArray(file.urls) && typeof file.urls[0] === 'string')
        cands.push(file.urls[0]);
    }
    const files = (updated as any).files;
    if (Array.isArray(files) && files.length) {
      const f0 = files[0];
      if (f0 && typeof f0 === 'object') {
        if (typeof f0.url === 'string') cands.push(f0.url);
        if (typeof f0.src === 'string') cands.push(f0.src);
        if (Array.isArray(f0.urls) && typeof f0.urls[0] === 'string')
          cands.push(f0.urls[0]);
      } else if (typeof f0 === 'string') cands.push(f0);
    }
    const urls = (updated as any).urls;
    if (Array.isArray(urls) && typeof urls[0] === 'string') cands.push(urls[0]);
    const media = (updated as any).media;
    if (media && typeof media === 'object') {
      const murl = media.downloadUrl || media.url;
      if (typeof murl === 'string') cands.push(murl);
    }
    for (const u of cands) {
      if (typeof u === 'string' && u.startsWith('http')) return u;
    }
    return undefined;
  };
  const dlUrl: string | undefined = pickUrlCandidate();
  const derivedKey =
    !downloadKey && dlUrl ? urlToKeyIfInSpaces(dlUrl) : undefined;
  if (derivedKey) {
    try {
      // Use console.log to avoid circular Nest Logger deps
      console.log(
        `[digital.normalize] Derived key from URL: ${dlUrl} -> ${derivedKey}`,
      );
    } catch {}
  }
  const effectiveKey = downloadKey || derivedKey || undefined;
  const isFree =
    typeof updated.isFree === 'boolean'
      ? updated.isFree
      : updated.is_free === true
        ? true
        : undefined;
  const legacyLicenseRequired =
    updated.licenseRequired === true || updated.license_required === true;
  if (effectiveKey && typeof effectiveKey === 'string') {
    // Build canonical structure
    const { filename, contentType } = inferFromKey(effectiveKey);
    const publicUrl = (() => {
      try {
        const bucket = process.env.DO_SPACES_BUCKET;
        const region = process.env.DO_SPACES_REGION;
        if (bucket && region)
          return `https://${bucket}.${region}.digitaloceanspaces.com/${effectiveKey}`;
      } catch {}
      return undefined;
    })();

    // Map alias fileSizeMB -> download.size (bytes) if present and valid
    let sizeBytes: number | undefined;
    if (
      typeof (updated as any).fileSizeMB === 'number' &&
      isFinite((updated as any).fileSizeMB) &&
      (updated as any).fileSizeMB > 0
    ) {
      sizeBytes = Math.round((updated as any).fileSizeMB * 1024 * 1024);
    }

    updated.digital = {
      type: 'digital',
      isFree: isFree === true ? true : undefined,
      download: {
        key: effectiveKey,
        publicUrl,
        filename,
        contentType,
        licenseRequired: legacyLicenseRequired ? true : undefined,
        size: sizeBytes ?? undefined,
      },
    } as DigitalAttributesSchema;
    delete updated.downloadKey;
    delete updated.download_key;
    delete updated.is_free;
    // Keep licenseRequired alias at root for prefill toggles; don't delete it here
    if ('license_required' in updated) delete updated.license_required;
    changed = true;
    return { updated, changed, inferredType: 'digital' };
  }
  return { updated, changed, inferredType: undefined };
}

/** Validate digital structure (throwing descriptive errors). */
export interface DigitalValidationOptions {
  requireKey?: boolean;
  maxSizeBytes?: number;
}

export function validateDigitalStructure(
  attrs: Record<string, any>,
  opts: DigitalValidationOptions = {},
): void {
  const dig = attrs?.digital;
  if (!dig) {
    if (opts.requireKey) {
      throw new Error('DIGITAL_MISSING_STRUCTURE');
    }
    return;
  }
  if (dig.type !== 'digital') throw new Error('DIGITAL_INVALID_TYPE');
  if (!dig.download || typeof dig.download !== 'object')
    throw new Error('DIGITAL_MISSING_DOWNLOAD');
  const key = dig.download.key;
  if (!key || typeof key !== 'string') throw new Error('DIGITAL_MISSING_KEY');
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext && !ALLOWED_EXT.has(ext)) throw new Error('DIGITAL_UNSUPPORTED_TYPE');
  const size = dig.download.size;
  if (typeof size === 'number' && opts.maxSizeBytes && size > opts.maxSizeBytes)
    throw new Error('DIGITAL_FILE_TOO_LARGE');
  if (dig.download.licenseRequired && !dig.download.license) {
    throw new Error('DIGITAL_LICENSE_REQUIRED');
  }
}

/** Map internal validation error codes to user-facing messages */
export function mapDigitalError(code: string): {
  code: string;
  message: string;
} {
  switch (code) {
    case 'DIGITAL_MISSING_STRUCTURE':
      return { code, message: 'Digital product structure missing.' };
    case 'DIGITAL_INVALID_TYPE':
      return { code, message: 'Invalid digital product type.' };
    case 'DIGITAL_MISSING_DOWNLOAD':
      return { code, message: 'Missing digital download metadata.' };
    case 'DIGITAL_MISSING_KEY':
      return { code, message: 'Digital download key not provided.' };
    case 'DIGITAL_UNSUPPORTED_TYPE':
      return { code, message: 'Unsupported digital file type.' };
    case 'DIGITAL_FILE_TOO_LARGE':
      return { code, message: 'Digital file exceeds maximum allowed size.' };
    case 'DIGITAL_LICENSE_REQUIRED':
      return {
        code,
        message: 'License information required for this digital download.',
      };
    default:
      return {
        code: 'DIGITAL_UNKNOWN',
        message: 'Unknown digital product error.',
      };
  }
}
