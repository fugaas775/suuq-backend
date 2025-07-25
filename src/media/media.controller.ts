// Backend: src/media/media.controller.ts

import {
  Controller,
  Post,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator, // Keep the import, but we won't use it
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('media')
export class MediaController {
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        // We only validate the size now.
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 10 }), // 10MB
          // The faulty FileTypeValidator has been removed.
        ],
        // Add this to prevent errors on an empty pipe
        fileIsRequired: true,
      }),
    )
    file: Express.MulterS3.File,
  ) {
    // Your manual safety check is still here, which is great!
    if (!file.mimetype || !/image\/(jpeg|png|gif)/.test(file.mimetype)) {
      return {
        error: true,
        message: `Invalid file type: ${file.mimetype}. Only image files are allowed.`,
      };
    }
    
    return {
      url: file.location,
      filename: file.key,
    };
  }
}