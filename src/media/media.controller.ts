import {
  Controller,
  Post,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  UseFilters,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DoSpacesService } from './do-spaces.service';
import sharpModule from 'sharp';
// import { ContentModerationService } from '../moderation/content-moderation.service';
import { MulterExceptionFilter } from './multer-exception.filter';
import { fileTypeFromBuffer } from 'file-type';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
const execFile = promisify(_execFile);
const sharpExec: any = (sharpModule as any)?.default ?? (sharpModule as any);

@Controller('media')
export class MediaController {
  constructor(private readonly doSpacesService: DoSpacesService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @UseFilters(MulterExceptionFilter)
  // Basic per-route throttle: e.g., 5 uploads per minute per client
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: 50 * 1024 * 1024,
            message: 'Please upload a file up to 50MB in size.',
          }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    const fs = await import('fs');

    // Read a small chunk for magic-bytes detection even with disk storage
    const fd = await fs.promises.open(file.path, 'r');
    const head = Buffer.alloc(4100);
    await fd.read(head, 0, head.length, 0);
    await fd.close();

    // Validate magic bytes to prevent disguised content
    const ft = await fileTypeFromBuffer(head).catch(() => undefined);
    let mime = ft?.mime || file.mimetype; // prefer detected mime
    // Fallback for some mobile-recorded videos where magic-bytes lib may return undefined
    if (!ft && file.mimetype?.startsWith('video/')) {
      const ext = (file.originalname.split('.').pop() || '').toLowerCase();
      const extToMime: Record<string, string> = {
        mp4: 'video/mp4',
        m4v: 'video/x-m4v',
        mov: 'video/quicktime',
        webm: 'video/webm',
        mkv: 'video/x-matroska',
        '3gp': 'video/3gpp',
        '3g2': 'video/3gpp2',
      };
      mime = extToMime[ext] || file.mimetype;
    }

    const isImage = mime?.startsWith('image/');
    const isVideo = mime?.startsWith('video/');

    const allowedImage = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
    ]);
    const allowedVideo = new Set([
      'video/mp4',
      'video/webm',
      'video/quicktime', // .mov
      'video/3gpp', // Android legacy capture
      'video/3gpp2',
      'video/x-m4v',
      'video/x-matroska', // .mkv
    ]);

    if (isImage && !allowedImage.has(mime)) {
      throw new BadRequestException(
        'Unsupported image type. Allowed: jpeg, png, webp, gif, avif.',
      );
    }
    if (isVideo && !allowedVideo.has(mime)) {
      throw new BadRequestException(
        'Unsupported video type. Allowed: mp4, webm, mov.',
      );
    }

    if (!isImage && !isVideo) {
      throw new BadRequestException(
        'Unsupported file type. Only images or videos are allowed.',
      );
    }

    const ts = Date.now();

    // Upload original file via stream to avoid buffering in memory
    const stream = fs.createReadStream(file.path);
    const fullUrl = await this.doSpacesService.uploadBody(
      stream,
      `full_${ts}_${file.originalname}`,
      mime,
    );

    if (isImage) {
      // Derive lightweight variants for images only
      const imageBuffer = await fs.promises.readFile(file.path);
      const thumbBuffer = await sharpExec(imageBuffer).resize(200).toBuffer();
      const thumbUrl = await this.doSpacesService.uploadFile(
        thumbBuffer,
        `thumb_${ts}_${file.originalname}`,
        mime,
      );

      const lowResBuffer = await sharpExec(imageBuffer).resize(50).toBuffer();
      const lowResUrl = await this.doSpacesService.uploadFile(
        lowResBuffer,
        `lowres_${ts}_${file.originalname}`,
        mime,
      );

      // Cleanup temp file
      void fs.promises.unlink(file.path).catch(() => {});
      return {
        kind: 'image',
        src: fullUrl,
        url: fullUrl,
        urls: [fullUrl],
        thumbnailSrc: thumbUrl,
        lowResSrc: lowResUrl,
      };
    }

    if (isVideo) {
      await fs.promises
        .mkdir('/tmp/uploads', { recursive: true })
        .catch(() => {});
      // Try to generate a small poster thumbnail using ffmpeg (best-effort)
      let posterUrl: string | undefined;
      try {
        const posterFilename = `poster_${ts}_${file.originalname.replace(/[^A-Za-z0-9._-]/g, '_')}.jpg`;
        const posterPath = path.join('/tmp/uploads', posterFilename);
        const argsPrimary = [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-ss',
          '00:00:01.000', // seek to 1s for a representative frame
          '-i',
          file.path,
          '-frames:v',
          '1',
          '-vf',
          'scale=320:-1',
          posterPath,
        ];
        try {
          await execFile('ffmpeg', argsPrimary, { timeout: 15000 });
        } catch {
          // Fallback: try from first frame without seek
          const argsFallback = [
            '-y',
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            file.path,
            '-frames:v',
            '1',
            '-vf',
            'scale=320:-1',
            posterPath,
          ];
          await execFile('ffmpeg', argsFallback, { timeout: 15000 });
        }

        // Upload poster
        const posterBuffer = await fs.promises.readFile(posterPath);
        posterUrl = await this.doSpacesService.uploadFile(
          posterBuffer,
          posterFilename,
          'image/jpeg',
        );
        void fs.promises.unlink(posterPath).catch(() => {});
      } catch {
        // If ffmpeg is unavailable or errors, continue without poster
      }

      // Cleanup temp file
      void fs.promises.unlink(file.path).catch(() => {});
      return {
        kind: 'video',
        src: fullUrl,
        url: fullUrl,
        urls: [fullUrl],
        posterSrc: posterUrl,
        posterUrl: posterUrl,
      };
    }

    // Fallback (should be unreachable due to validator)
    void fs.promises.unlink(file.path).catch(() => {});
    return { src: fullUrl, url: fullUrl, urls: [fullUrl] };
  }
}
