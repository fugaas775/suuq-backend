import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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
    });

    await this.s3.send(command);

    // ✨ THE FINAL FIX: Construct the correct public URL
    return `https://${this.bucket}.${this.region}.digitaloceanspaces.com/${filename}`;
  }
}