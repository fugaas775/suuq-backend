import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
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
        accessKeyId: process.env.DO_SPACES_KEY!,
        secretAccessKey: process.env.DO_SPACES_SECRET!,
      },
      region: this.region,
    });
  }

  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimetype: string,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: filename,
      Body: buffer,
      ACL: 'public-read',
      ContentType: mimetype,
      ContentDisposition: 'inline',
  CacheControl: 'public, max-age=31536000, immutable',
    });

    await this.s3.send(command);

    // ✨ THE FINAL FIX: Construct the correct public URL
    return `https://${this.bucket}.${this.region}.digitaloceanspaces.com/${filename}`;
  }

  /**
   * Build a short-lived signed URL for private objects.
   * Allows setting response content type and disposition for inline preview.
   */
  async getSignedUrl(
    key: string,
    ttlSecs = 300,
    opts?: { contentType?: string; inlineFilename?: string }
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: opts?.contentType,
      ResponseContentDisposition: opts?.inlineFilename
        ? `inline; filename="${opts.inlineFilename}"`
        : 'inline',
    });
    return awsGetSignedUrl(this.s3 as any, command as any, { expiresIn: ttlSecs });
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
}