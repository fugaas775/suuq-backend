import { Injectable } from '@nestjs/common';
import { MulterOptionsFactory, MulterModuleOptions } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MulterConfigService implements MulterOptionsFactory {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.getOrThrow<string>('DO_SPACES_BUCKET');
    
    this.s3Client = new S3Client({
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('DO_SPACES_KEY'),
        secretAccessKey: this.configService.getOrThrow<string>('DO_SPACES_SECRET'),
      },
      endpoint: this.configService.getOrThrow<string>('DO_SPACES_ENDPOINT'),
      region: this.configService.getOrThrow<string>('DO_SPACES_REGION'),
    });
  }

  createMulterOptions(): MulterModuleOptions {
    return {
      storage: multerS3({
        s3: this.s3Client,
        bucket: this.bucket,
        acl: 'public-read',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (_req, file, cb) => {
          const extension = file.originalname.split('.').pop();
          const uniqueName = `${uuidv4()}.${extension}`;
          cb(null, uniqueName);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (_req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Unsupported file type'), false);
        }
      },
    };
  }
}
