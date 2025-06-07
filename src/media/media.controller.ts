import {
  Controller,
  Post,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Delete,
  Param,
  Req,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { MediaService } from './media.service';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import multerS3 from 'multer-s3';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Request as ExpressRequest } from 'express';
import { User } from '../users/user.entity';
import { UserRole } from '../auth/roles.enum';
import { MediaResponseDto } from './dto/media-response.dto';

interface AuthenticatedRequest extends ExpressRequest {
  user?: User;
}

// Factory for multerS3 storage engine with explicit types
function createMulterStorage(configService: ConfigService) {
  const accessKeyId = configService.get<string>('DO_SPACES_KEY')!;
  const secretAccessKey = configService.get<string>('DO_SPACES_SECRET')!;
  const region = configService.get<string>('DO_SPACES_REGION')!;
  const endpoint = configService.get<string>('DO_SPACES_ENDPOINT')!;
  const bucket = configService.get<string>('DO_SPACES_BUCKET')!;

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
    key: (
      _req: ExpressRequest,
      file: Express.Multer.File,
      cb: (error: Error | null, key?: string) => void
    ) => {
      const ext = path.extname(file.originalname);
      cb(null, `products/${uuidv4()}${ext}`);
    },
  });
}

@Controller('suuq/v1/media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly configService: ConfigService
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: null as any, // Will be set in the method below
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest
  ): Promise<MediaResponseDto> {
    if (!req.user) throw new UnauthorizedException('User not authenticated');
    if (!file) throw new BadRequestException('No file uploaded');

    const media = await this.mediaService.saveFile(file, req.user.id);
    return new MediaResponseDto({
      id: media.id,
      src: media.src,
      key: media.key,
    });
  }

  // This hook sets the storage at runtime (Nest can't access DI in the decorator)
  static setInterceptorStorage(controller: MediaController) {
    const interceptors = Reflect.getMetadata('interceptors', controller, 'upload');
    if (interceptors?.[0]?.options) {
      interceptors[0].options.storage = createMulterStorage(controller.configService);
    }
  }

  @Delete('delete/:key')
  async delete(@Param('key') key: string, @Req() req: AuthenticatedRequest) {
    if (!req.user) throw new UnauthorizedException();
    const decodedKey = decodeURIComponent(key);
    const deleted = await this.mediaService.deleteByKey(decodedKey, req.user.id);
    return { deleted };
  }
}