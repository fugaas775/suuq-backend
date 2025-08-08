import {
  Controller,
  Post,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DoSpacesService } from './do-spaces.service';
import * as sharp from 'sharp';

@Controller('media')
export class MediaController {
  constructor(private readonly doSpacesService: DoSpacesService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 10 }), // 10MB
          new FileTypeValidator({ fileType: 'image' }),
        ],
        fileIsRequired: true,
      }),
    )
    // ✨ FINAL FIX: Update the file type to the standard Multer file
    file: Express.Multer.File,
  ) {
    // Upload full-res
    const fullUrl = await this.doSpacesService.uploadFile(
      file.buffer,
      `full_${Date.now()}_${file.originalname}`,
      file.mimetype,
    );

    // Create and upload thumbnail (resize to 200px)
    const thumbBuffer = await sharp(file.buffer).resize(200).toBuffer();
    const thumbUrl = await this.doSpacesService.uploadFile(
      thumbBuffer,
      `thumb_${Date.now()}_${file.originalname}`,
      file.mimetype,
    );

    // Create and upload low-res (resize to 50px)
    const lowResBuffer = await sharp(file.buffer).resize(50).toBuffer();
    const lowResUrl = await this.doSpacesService.uploadFile(
      lowResBuffer,
      `lowres_${Date.now()}_${file.originalname}`,
      file.mimetype,
    );

    return {
      src: fullUrl,
      thumbnailSrc: thumbUrl,
      lowResSrc: lowResUrl,
    };
  }
}