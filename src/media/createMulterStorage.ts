// src/media/createMulterStorage.ts

import multerS3 from 'multer-s3';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// It's better to inject ConfigService via NestJS DI, 
// but for a standalone file like this, direct instantiation is a common pattern.
const config = new ConfigService();

const BUCKET = config.getOrThrow<string>('DO_SPACES_BUCKET');

// 1. Instantiate the S3Client from AWS SDK v3
const s3Client = new S3Client({
  credentials: {
    accessKeyId: config.getOrThrow<string>('DO_SPACES_KEY'),
    secretAccessKey: config.getOrThrow<string>('DO_SPACES_SECRET'),
  },
  endpoint: config.getOrThrow<string>('DO_SPACES_ENDPOINT'),
  region: config.getOrThrow<string>('DO_SPACES_REGION'),
});

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
];
const VALID_FOLDERS = ['products', 'avatars', 'documents'];

export function createMulterStorage(
  folder: 'products' | 'avatars' | 'documents' = 'products',
): MulterOptions {
  const safeFolder = VALID_FOLDERS.includes(folder) ? folder : 'products';

  return {
    storage: multerS3({
      s3: s3Client, // 2. Pass the S3Client instance here
      bucket: BUCKET,
      acl: 'public-read',
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (_req: Request, file, cb) => {
        const extension = file.originalname.split('.').pop();
        const uniqueName = `${uuidv4()}.${extension}`;
        const fullKey = `${safeFolder}/${uniqueName}`;
        cb(null, fullKey);
      },
    }),
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Unsupported file type'), false);
      }
    },
  };
}

// 3. Update the delete function to use the v3 command pattern
export async function deleteFromSpaces(key: string): Promise<void> {
  const deleteCommand = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  try {
    await s3Client.send(deleteCommand);
    console.log(`[S3] Deleted object: ${key}`);
  } catch (err) {
    console.error(`[S3] Failed to delete object: ${key}`, err);
    throw err;
  }
}