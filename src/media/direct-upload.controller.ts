import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DoSpacesService } from './do-spaces.service';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { fileTypeFromBuffer } from 'file-type';
const execFile = promisify(_execFile);
// Use require to avoid TS2349 in certain editor setups while keeping runtime interop safe
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharpAny: any = require('sharp');

// Simple direct-upload flow:
// 1) Client POST /api/media/request-signed-url with { filename, contentType }
//    -> returns { key, putUrl, publicUrl }
// 2) Client PUTs the file to putUrl
// 3) Client POST /api/media/finalize with { key, contentType, kind: 'image'|'video' }
//    -> generates variants (thumb/lowres for images; poster for videos) and returns URLs

@Controller('media')
export class DirectUploadController {
  constructor(private readonly doSpaces: DoSpacesService) {}

  @Post('request-signed-url')
  @UseGuards(JwtAuthGuard)
  async requestSignedUrl(@Body() body: { filename: string; contentType: string }) {
    const { filename, contentType } = body || ({} as any);
    if (!filename || !contentType) {
      throw new BadRequestException('filename and contentType are required');
    }
    const ts = Date.now();
    // Store under a generic root; caller can prefix if needed
    const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_');
    const key = `${ts}_${safeName}`;
    const expiresIn = 3600; // seconds
    const putUrl = await this.doSpaces.getUploadSignedUrl(key, contentType, expiresIn);
    const publicUrl = this.doSpaces.buildPublicUrl(key);
    // Tell client which headers are required for PUT to match the signature
    const requiredHeaders = {
      'Content-Type': contentType,
      // Do not send other headers (no ACL/Cache-Control/Content-Disposition) on client PUT
    } as const;
    return { key, putUrl, publicUrl, expiresIn, requiredHeaders };
  }

  @Post('finalize')
  @UseGuards(JwtAuthGuard)
  async finalize(@Body() body: { key: string; contentType: string; kind?: 'image' | 'video' | 'file'; deriveCover?: boolean }) {
    const { key, contentType, kind, deriveCover } = body || ({} as any);
    if (!key || !contentType) {
      throw new BadRequestException('key and contentType are required');
    }
    const exists = await this.doSpaces.headObjectExists(key);
    if (!exists) {
      throw new BadRequestException('Uploaded object not found. Ensure the PUT to the signed URL completed successfully.');
    }
    const meta = await this.doSpaces.headObjectMeta(key);
    const resolvedContentType = meta?.contentType || contentType;
    const fileName = key.split('/').pop();
    const maxImageBytes = 50 * 1024 * 1024;
    const maxVideoBytes = 150 * 1024 * 1024;
    const maxFileBytes = 100 * 1024 * 1024;

    // Ensure object is public-read for direct access
    await this.doSpaces.setPublicRead(key).catch(() => void 0);
    // Stable canonical public URL (never signed) used for storing in product attributes.
    const url = this.doSpaces.buildPublicUrl(key);
    const ts = Date.now();

    if (kind === 'image' || contentType.startsWith('image/')) {
      if (typeof meta?.contentLength === 'number' && meta.contentLength > maxImageBytes) {
        throw new BadRequestException('Image too large. Max size is 50MB.');
      }
      const imageBuffer = await this.doSpaces.getObjectBuffer(key);
      const ft = await fileTypeFromBuffer(imageBuffer).catch(() => undefined);
      const mime = ft?.mime || resolvedContentType || 'application/octet-stream';
      const allowedImage = new Set([
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/avif',
      ]);
      if (!allowedImage.has(mime)) {
        throw new BadRequestException('Unsupported image type. Allowed: jpeg, png, webp, gif, avif.');
      }
      const thumbBuffer = await sharpAny(imageBuffer).resize(200).toBuffer();
      const lowResBuffer = await sharpAny(imageBuffer).resize(50).toBuffer();

      const thumbKey = `thumb_${ts}_${key}`;
      const lowResKey = `lowres_${ts}_${key}`;
      const thumbUrl = await this.doSpaces.uploadFile(thumbBuffer, thumbKey, mime);
      const lowResUrl = await this.doSpaces.uploadFile(lowResBuffer, lowResKey, mime);
      return {
        kind: 'image',
        src: url,
        url,
        urls: [url],
        thumbnailSrc: thumbUrl,
        lowResSrc: lowResUrl,
      };
    }

    if (kind === 'video' || contentType.startsWith('video/')) {
      if (typeof meta?.contentLength === 'number' && meta.contentLength > maxVideoBytes) {
        throw new BadRequestException('Video too large. Max size is 150MB.');
      }
      const headBytes = await this.doSpaces.getObjectHeadBytes(key, 4096);
      const ft = await fileTypeFromBuffer(headBytes).catch(() => undefined);
      const mime = ft?.mime || resolvedContentType || 'application/octet-stream';
      const allowedVideo = new Set([
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'video/3gpp',
        'video/3gpp2',
        'video/x-m4v',
        'video/x-matroska',
      ]);
      if (!allowedVideo.has(mime)) {
        throw new BadRequestException('Unsupported video type. Allowed: mp4, webm, mov.');
      }
      const posterKey = `poster_${ts}_${key.replace(/[^A-Za-z0-9._/-]/g, '_')}.jpg`;
      this.generatePosterAsync(key, posterKey, maxVideoBytes).catch(() => void 0);
      return {
        kind: 'video',
        src: url,
        url,
        urls: [url],
        posterKey,
        posterUrl: this.doSpaces.buildPublicUrl(posterKey),
      };
    }

    if (kind === 'file' || contentType.startsWith('application/')) {
      const allowed = new Set([
        'application/pdf',
        'application/epub+zip',
        'application/zip',
      ]);
      const effectiveContentType = resolvedContentType || contentType;
      if (!allowed.has(effectiveContentType)) {
        throw new BadRequestException('Unsupported file type. Allowed: PDF, EPUB, ZIP.');
      }
      if (typeof meta?.contentLength === 'number' && meta.contentLength > maxFileBytes) {
        throw new BadRequestException('File too large. Max size is 100MB.');
      }
      const base = {
        kind: 'file' as const,
        src: url,
        url,
        urls: [url],
        contentType: effectiveContentType,
        contentLength: meta?.contentLength,
        filename: fileName,
      };
      if (deriveCover && effectiveContentType === 'application/pdf') {
        const ts2 = Date.now();
        const coverKey = `cover_${ts2}_${key.replace(/[^A-Za-z0-9._/-]/g, '_')}.jpg`;
        const coverUrl = this.doSpaces.buildPublicUrl(coverKey);
        this.generatePdfCoverAsync(key, coverKey, maxFileBytes).catch(() => void 0);
        return { ...base, coverKey, coverUrl };
      }
      return base;
    }

    return { src: url, url, urls: [url] };
  }

  // Return a short-lived signed GET URL for playback. Accepts either full Spaces URL or object key.
  @Get('signed-playback')
  @UseGuards(JwtAuthGuard)
  async signedPlayback(
    @Query('url') url?: string,
    @Query('key') key?: string,
    @Query('ttl') ttl?: string,
  ) {
    const objectKey = key || (url ? this.doSpaces.extractKeyFromUrl(url) : undefined);
    if (!objectKey) throw new BadRequestException('Provide url or key');
    const exists = await this.doSpaces.headObjectExists(objectKey);
    if (!exists) throw new NotFoundException('Object not found');
    const ttlSecs = Math.max(60, Math.min(parseInt(String(ttl || '300'), 10) || 300, 3600));
    const ext = (objectKey.split('.').pop() || '').toLowerCase();
    const mime = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : undefined;
    const inlineName = objectKey.split('/').pop();
    const signedUrl = await this.doSpaces.getSignedUrl(objectKey, ttlSecs, { contentType: mime, inlineFilename: inlineName });
    return { url: signedUrl, expiresIn: ttlSecs, contentType: mime };
  }

  @Get('poster-status')
  @UseGuards(JwtAuthGuard)
  async posterStatus(@Query('key') key?: string) {
    if (!key) throw new BadRequestException('key is required');
    const exists = await this.doSpaces.headObjectExists(key);
    return { exists, posterUrl: this.doSpaces.buildPublicUrl(key) };
  }

  private async generatePosterAsync(originalKey: string, posterKey: string, maxBytes: number): Promise<void> {
    try {
      const tmpDir = '/tmp/uploads';
      const fs = await import('fs');
      await fs.promises.mkdir(tmpDir, { recursive: true });
      const fileNameSafe = originalKey.split('/').pop() || originalKey;
      const videoPath = path.join(tmpDir, `poster_${Date.now()}_${fileNameSafe}`);
      await this.doSpaces.downloadToFile(originalKey, videoPath);
      const stat = await fs.promises.stat(videoPath).catch(() => null);
      if (stat && stat.size > maxBytes) {
        void fs.promises.unlink(videoPath).catch(() => {});
        return;
      }
      const posterPath = path.join(tmpDir, `poster_${Date.now()}_${fileNameSafe}.jpg`);
      const args = ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '00:00:01.000', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=320:-1', posterPath];
      try {
        await execFile('ffmpeg', args, { timeout: 20000 });
      } catch {
        const fallback = ['-y', '-hide_banner', '-loglevel', 'error', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=320:-1', posterPath];
        await execFile('ffmpeg', fallback, { timeout: 20000 });
      }
      const posterBuf = await fs.promises.readFile(posterPath);
      await this.doSpaces.uploadFile(posterBuf, posterKey, 'image/jpeg');
      await this.doSpaces.setPublicRead(posterKey).catch(() => void 0);
      void fs.promises.unlink(videoPath).catch(() => {});
      void fs.promises.unlink(posterPath).catch(() => {});
    } catch {
      // best-effort; ignore
    }
  }

  private async generatePdfCoverAsync(originalKey: string, outputKey: string, maxBytes: number): Promise<void> {
    try {
      const tmpDir = '/tmp/uploads';
      const fileNameSafe = originalKey.split('/').pop() || originalKey;
      const ts = Date.now();
      const fs = await import('fs');
      await fs.promises.mkdir(tmpDir, { recursive: true });
      const pdfPath = path.join(tmpDir, `${ts}_${fileNameSafe}.pdf`);
      await this.doSpaces.downloadToFile(originalKey, pdfPath);
      const stat = await fs.promises.stat(pdfPath).catch(() => null);
      if (stat && stat.size > maxBytes) {
        void fs.promises.unlink(pdfPath).catch(() => {});
        return;
      }
      const coverPath = path.join(tmpDir, `${ts}_pdf_cover.jpg`);
      try {
        const outPrefix = path.join(tmpDir, `${ts}_cover`);
        await execFile('pdftoppm', ['-jpeg', '-f', '1', '-singlefile', '-scale-to', '320', pdfPath, outPrefix], { timeout: 20000 });
        const ppmCover = `${outPrefix}.jpg`;
        await fs.promises.rename(ppmCover, coverPath).catch(async () => {
          const statCheck = await fs.promises.stat(ppmCover).catch(() => null);
          if (!statCheck) throw new Error('pdftoppm did not produce output');
          await fs.promises.copyFile(ppmCover, coverPath);
        });
      } catch {
        try {
          await execFile('convert', ['-thumbnail', '320', `${pdfPath}[0]`, '-background', 'white', '-alpha', 'remove', '-alpha', 'off', coverPath], { timeout: 20000 });
        } catch {
          return;
        }
      }

      const coverBuf = await fs.promises.readFile(coverPath);
      await this.doSpaces.uploadFile(coverBuf, outputKey, 'image/jpeg');
      await this.doSpaces.setPublicRead(outputKey).catch(() => void 0);
      void fs.promises.unlink(pdfPath).catch(() => {});
      void fs.promises.unlink(coverPath).catch(() => {});
    } catch {
      // ignore
    }
  }
}
