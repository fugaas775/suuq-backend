import { Injectable } from '@nestjs/common';
import type { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  PutObjectAclCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class DoSpacesService {
  private s3: S3Client;
  private bucket: string;
  private region: string;
  private endpoint: string;

  constructor() {
    // Store these from environment variables
    this.bucket = process.env.DO_SPACES_BUCKET!;
    this.region = process.env.DO_SPACES_REGION!;
    this.endpoint = process.env.DO_SPACES_ENDPOINT!;

    this.s3 = new S3Client({
      endpoint: this.endpoint,
      credentials: {
        accessKeyId: process.env.DO_SPACES_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET,
      },
      region: this.region,
    });
  }

  async uploadBody(
    body: Buffer | Readable,
    filename: string,
    mimetype: string,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: filename,
      Body: body,
      ACL: 'public-read',
      ContentType: mimetype,
      ContentDisposition: 'inline',
      CacheControl: 'public, max-age=31536000, immutable',
    });

    await this.s3.send(command);

  // ✨ THE FINAL FIX: Construct the correct public URL
  return this.buildPublicUrl(filename);
  }

  // Backward compatibility: buffer-based helper
  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimetype: string,
  ): Promise<string> {
    return this.uploadBody(buffer, filename, mimetype);
  }

  /**
   * Build a short-lived signed URL for private objects.
   * Allows setting response content type and disposition for inline preview.
   */
  async getSignedUrl(
    key: string,
    ttlSecs = 300,
    opts?: { contentType?: string; inlineFilename?: string },
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: opts?.contentType,
      ResponseContentDisposition: opts?.inlineFilename
        ? `inline; filename="${opts.inlineFilename}"`
        : 'inline',
    });
    return awsGetSignedUrl(this.s3 as any, command as any, {
      expiresIn: ttlSecs,
    });
  }

  /** Build a short-lived signed URL forcing download (attachment). */
  async getDownloadSignedUrl(
    key: string,
    ttlSecs = 300,
    opts?: { contentType?: string; filename?: string },
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: opts?.contentType,
      ResponseContentDisposition: opts?.filename
        ? `attachment; filename="${opts.filename}"`
        : 'attachment',
    });
    return awsGetSignedUrl(this.s3 as any, command as any, {
      expiresIn: ttlSecs,
    });
  }

  /** Extract the object key from a full Spaces URL. */
  extractKeyFromUrl(url: string): string | null {
    try {
      const u = new URL(url);
      // URL path starts with '/', strip it
      return u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
    } catch {
      return null;
    }
  }

  /**
   * If the given URL points to this application's Spaces bucket, return the object key.
   * Supports both virtual-hosted (bucket.region.digitaloceanspaces.com/key)
   * and path-style (region.digitaloceanspaces.com/bucket/key) URLs, including CDN subdomain.
   */
  urlToKeyIfInBucket(url: string): string | null {
    try {
      const u = new URL(url);
      const host = u.host.toLowerCase();
      const path = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
      const expectedVirtual = `${this.bucket}.${this.region}.digitaloceanspaces.com`.toLowerCase();
      const expectedCdnVirtual = `${this.bucket}.${this.region}.cdn.digitaloceanspaces.com`.toLowerCase();
      const regionHost = `${this.region}.digitaloceanspaces.com`.toLowerCase();
      const cdnRegionHost = `${this.region}.cdn.digitaloceanspaces.com`.toLowerCase();
      // Virtual-hosted: bucket.region.digitaloceanspaces.com/<key>
      if (host === expectedVirtual || host === expectedCdnVirtual) {
        return path || null;
      }
      // Path-style: region.digitaloceanspaces.com/<bucket>/<key>
      if (host === regionHost || host === cdnRegionHost) {
        if (path.startsWith(`${this.bucket}/`)) {
          return path.slice(this.bucket.length + 1) || null;
        }
      }
      // Custom endpoints: try to match configured endpoint host
      try {
        const endpointHost = new URL(this.endpoint).host.toLowerCase();
        if (host === endpointHost && path.startsWith(`${this.bucket}/`)) {
          return path.slice(this.bucket.length + 1) || null;
        }
      } catch {
        // ignore endpoint parsing failures
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Build the public URL for a given object key. */
  buildPublicUrl(key: string): string {
    return `https://${this.bucket}.${this.region}.digitaloceanspaces.com/${key}`;
  }

  /** Ensure an object is world-readable. */
  async setPublicRead(key: string): Promise<void> {
    try {
      const cmd = new PutObjectAclCommand({ Bucket: this.bucket, Key: key, ACL: 'public-read' });
      await this.s3.send(cmd);
    } catch {
      // Best-effort; if bucket policy already grants public read or ACLs are disabled, ignore
    }
  }

  /** Return basic HEAD metadata: content length, content type, and raw metadata. */
  async headObjectMeta(
    key: string,
  ): Promise<{ contentLength?: number; contentType?: string; metadata?: Record<string, string> }>{
    try {
      const cmd = new HeadObjectCommand({ Bucket: this.bucket, Key: key });
      const res = (await this.s3.send(cmd)) as any;
      return {
        contentLength: typeof res?.ContentLength === 'number' ? res.ContentLength : undefined,
        contentType: typeof res?.ContentType === 'string' ? res.ContentType : undefined,
        metadata: res?.Metadata as Record<string, string> | undefined,
      };
    } catch {
      return {};
    }
  }

  /** Create a short-lived signed PUT URL for direct uploads to Spaces. */
  async getUploadSignedUrl(
    key: string,
    contentType: string,
    ttlSecs = 3600,
    _opts?: { cacheControl?: string; contentDisposition?: string; acl?: 'private' | 'public-read' },
  ): Promise<string> {
    // Keep signed headers minimal to avoid client mismatches; bucket should allow public reads
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      // Avoid signing CacheControl/ContentDisposition/ACL to keep client-side PUT requirements minimal
    });
    return awsGetSignedUrl(this.s3 as any, command as any, { expiresIn: ttlSecs });
  }

  /** Download an object into a Buffer (for images to derive thumbnails). */
  async getObjectBuffer(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const res = await this.s3.send(command);
    const body = res.Body as Readable;
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      body.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      body.on('end', () => resolve());
      body.on('error', (e) => reject(e));
    });
    return Buffer.concat(chunks);
  }

  /** Check if an object exists (HEAD). */
  async headObjectExists(key: string): Promise<boolean> {
    try {
      const cmd = new HeadObjectCommand({ Bucket: this.bucket, Key: key });
      await this.s3.send(cmd);
      return true;
    } catch (e: any) {
      // NotFound or 404 -> false
      if (e?.$metadata?.httpStatusCode === 404) return false;
      return false;
    }
  }

  /** List object keys under a prefix (single page). */
  async listKeys(prefix = '', maxKeys = 1000, continuationToken?: string): Promise<{ keys: string[]; nextToken?: string }>{
    const cmd = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix || undefined,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    } as any);
  const res = (await this.s3.send(cmd as any)) as any;
  const keys = ((res?.Contents as any[]) || []).map((o: any) => o.Key).filter(Boolean);
  const nextToken = res?.NextContinuationToken as string | undefined;
    return { keys, nextToken };
  }

  /** Delete an object from Spaces (best-effort). */
  async deleteObject(key: string): Promise<void> {
    try {
      const cmd = new DeleteObjectCommand({ Bucket: this.bucket, Key: key });
      await this.s3.send(cmd as any);
    } catch {
      // ignore failures; caller may log
    }
  }
}
