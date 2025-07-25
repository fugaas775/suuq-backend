import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import * as multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';

@Module({
  imports: [
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        storage: multerS3({
          s3: new S3Client({
            endpoint: configService.get('DO_SPACES_ENDPOINT'),
            region: configService.get('DO_SPACES_REGION'),
            credentials: {
              accessKeyId: configService.get('DO_SPACES_KEY')!,
              secretAccessKey: configService.get('DO_SPACES_SECRET')!,
            },
          }),
          bucket: configService.get('DO_SPACES_BUCKET')!,
          acl: 'public-read',
          contentType: multerS3.AUTO_CONTENT_TYPE,
          key: (req, file, cb) => {
            const filename = `${Date.now()}-${uuidv4()}-${file.originalname}`;
            cb(null, filename);
          },
        }),
        limits: {
          fileSize: 1024 * 1024 * 10, // 10 MB file size limit
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [MediaController],
})
export class MediaModule {}
