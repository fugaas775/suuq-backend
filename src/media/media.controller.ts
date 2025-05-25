import {
  Controller,
  Post,
  UseGuards,
  UploadedFile,
  Delete,
  Param,
  Req,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MediaService } from './media.service';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import multerS3 from 'multer-s3';
import multer from 'multer';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Request as ExpressRequest } from 'express';
import { User } from '../users/user.entity';


interface AuthenticatedRequest extends ExpressRequest {
  user?: User;
}

@Controller('suuq/v1/media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('VENDOR')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly configService: ConfigService
  ) {}

  private createMulterStorage() {
    const accessKeyId = this.configService.get<string>('DO_SPACES_KEY')!;
    const secretAccessKey = this.configService.get<string>('DO_SPACES_SECRET')!;
    const region = this.configService.get<string>('DO_SPACES_REGION')!;
    const endpoint = this.configService.get<string>('DO_SPACES_ENDPOINT')!;
    const bucket = this.configService.get<string>('DO_SPACES_BUCKET')!;

    console.log('🚨 DO_SPACES_BUCKET:', bucket); // ✅ Runtime check

    const s3 = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: false,
    });

    return multerS3({
      s3,
      bucket,
      acl: 'public-read',
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `products/${uuidv4()}${ext}`);
      },
    });
  }

  @Post()
async upload(@Req() req: AuthenticatedRequest): Promise<any> {
  if (!req.user) throw new UnauthorizedException('User not authenticated');

  const accessKeyId = this.configService.get<string>('DO_SPACES_KEY')!;
  const secretAccessKey = this.configService.get<string>('DO_SPACES_SECRET')!;
  const region = this.configService.get<string>('DO_SPACES_REGION')!;
  const endpoint = this.configService.get<string>('DO_SPACES_ENDPOINT')!;
  const bucket = this.configService.get<string>('DO_SPACES_BUCKET')!;

  console.log('🚨 Runtime Bucket:', bucket); // This must print suuq-media

  const s3 = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });

  const upload = multer({
    storage: multerS3({
      s3,
      bucket,
      acl: 'public-read',
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `products/${uuidv4()}${ext}`);
      },
    }),
  }).single('file');

  return new Promise((resolve, reject) => {
    upload(req, req.res as any, async (err) => {
      if (err) return reject(err);
      if (!req.file) return reject(new BadRequestException('No file uploaded'));

      const media = await this.mediaService.saveFile(req.file, req.user!.id);
      resolve({
        id: media.id,
        src: media.src,
        key: media.key,
      });
    });
  });
}


  @Delete('delete/:key')
async delete(@Param('key') key: string, @Req() req: AuthenticatedRequest) {
  if (!req.user) throw new UnauthorizedException();
  const decodedKey = decodeURIComponent(key);
  const deleted = await this.mediaService.deleteByKey(decodedKey, req.user.id);
  return { deleted };
}

}

