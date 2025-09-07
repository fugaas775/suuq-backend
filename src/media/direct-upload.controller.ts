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
import * as sharp from 'sharp';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
const execFile = promisify(_execFile);

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
  // Ensure object is public-read for direct access
  await this.doSpaces.setPublicRead(key).catch(() => void 0);
  const url = this.doSpaces.buildPublicUrl(key);
    const ts = Date.now();

    if (kind === 'image' || contentType.startsWith('image/')) {
      // Derive image variants from the uploaded object
      const imageBuffer = await this.doSpaces.getObjectBuffer(key);
      const thumbBuffer = await sharp(imageBuffer).resize(200).toBuffer();
      const lowResBuffer = await sharp(imageBuffer).resize(50).toBuffer();

      const thumbKey = `thumb_${ts}_${key}`;
      const lowResKey = `lowres_${ts}_${key}`;
      const thumbUrl = await this.doSpaces.uploadFile(thumbBuffer, thumbKey, contentType);
      const lowResUrl = await this.doSpaces.uploadFile(lowResBuffer, lowResKey, contentType);
  const res = {
        kind: 'image',
        src: url,
        url,
        urls: [url],
        thumbnailSrc: thumbUrl,
        lowResSrc: lowResUrl,
  };
  return res;
    }

    if (kind === 'video' || contentType.startsWith('video/')) {
      // Kick off best-effort async poster generation and return immediately
  this.generatePosterAsync(key).catch(() => void 0);
      const posterKey = `poster_${ts}_${key.replace(/[^A-Za-z0-9._/-]/g, '_')}.jpg`;
  const res = {
        kind: 'video',
        src: url,
        url,
        urls: [url],
        posterKey, // may not exist yet; poll /media/poster-status?key=
        posterUrl: this.doSpaces.buildPublicUrl(posterKey),
  };
  return res;
    }

    // Handle generic files (e.g., PDFs, EPUB, ZIP) and return basic metadata
    if (kind === 'file' || contentType.startsWith('application/')) {
      const meta = await this.doSpaces.headObjectMeta(key);
      const fileName = key.split('/').pop();
      const allowed = new Set([
        'application/pdf',
        'application/epub+zip',
        'application/zip',
      ]);
      if (!allowed.has(contentType)) {
        throw new BadRequestException('Unsupported file type. Allowed: PDF, EPUB, ZIP.');
      }
      const maxBytes = 100 * 1024 * 1024; // 100MB
      if (typeof meta?.contentLength === 'number' && meta.contentLength > maxBytes) {
        throw new BadRequestException('File too large. Max size is 100MB.');
      }
      // Preferred: vendor uploads a separate cover image; only derive cover if explicitly requested
      const base = {
        kind: 'file' as const,
        src: url,
        url,
        urls: [url],
        contentType,
        contentLength: meta?.contentLength,
        filename: fileName,
      };
      if (deriveCover && contentType === 'application/pdf') {
        const ts2 = Date.now();
        const coverKey = `cover_${ts2}_${key.replace(/[^A-Za-z0-9._/-]/g, '_')}.jpg`;
        const coverUrl = this.doSpaces.buildPublicUrl(coverKey);
        // Fire-and-forget best-effort generation
        this.generatePdfCoverAsync(key, coverKey).catch(() => void 0);
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
  // Fetch HEAD for metadata
  const exists = await this.doSpaces.headObjectExists(objectKey);
  if (!exists) throw new NotFoundException('Object not found');
    const ttlSecs = Math.max(60, Math.min(parseInt(String(ttl || '300'), 10) || 300, 3600));
  const ext = (objectKey.split('.').pop() || '').toLowerCase();
  const mime = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : undefined;
  const fileName = objectKey.split('/').pop();
  const signedUrl = await this.doSpaces.getSignedUrl(objectKey, ttlSecs, { contentType: mime, inlineFilename: fileName });
  return { url: signedUrl, expiresIn: ttlSecs, contentType: mime };
  }

  // Poll poster generation status: returns 200 with { exists, posterUrl }
  @Get('poster-status')
  @UseGuards(JwtAuthGuard)
  async posterStatus(@Query('key') key?: string) {
    if (!key) throw new BadRequestException('key is required');
    const exists = await this.doSpaces.headObjectExists(key);
    return { exists, posterUrl: this.doSpaces.buildPublicUrl(key) };
  }

  // Best-effort worker that downloads the video to disk and extracts a poster with ffmpeg
  private async generatePosterAsync(originalKey: string): Promise<void> {
    try {
      const tmpDir = '/tmp/uploads';
      const fileNameSafe = originalKey.split('/').pop() || originalKey;
      const ts = Date.now();
      const posterKey = `poster_${ts}_${originalKey.replace(/[^A-Za-z0-9._/-]/g, '_')}.jpg`;
      // Download video into a temp file
      const videoBuf = await this.doSpaces.getObjectBuffer(originalKey);
      const fs = await import('fs');
      const videoPath = path.join(tmpDir, `${ts}_${fileNameSafe}`);
      await fs.promises.writeFile(videoPath, videoBuf);
      // Build poster on disk
      const posterPath = path.join(tmpDir, `poster_${ts}_${fileNameSafe}.jpg`);
      const args = ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '00:00:01.000', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=320:-1', posterPath];
      try {
        await execFile('ffmpeg', args, { timeout: 20000 });
      } catch {
        const fallback = ['-y', '-hide_banner', '-loglevel', 'error', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=320:-1', posterPath];
        await execFile('ffmpeg', fallback, { timeout: 20000 });
      }
      // Upload poster
      const posterBuf = await fs.promises.readFile(posterPath);
  await this.doSpaces.uploadFile(posterBuf, posterKey, 'image/jpeg');
  await this.doSpaces.setPublicRead(posterKey).catch(() => void 0);
      // Cleanup
      void fs.promises.unlink(videoPath).catch(() => {});
      void fs.promises.unlink(posterPath).catch(() => {});
    } catch {
      // best-effort; ignore
    }
  }

  // Best-effort worker to render first page cover for PDFs using pdftoppm or ImageMagick
  private async generatePdfCoverAsync(originalKey: string, outputKey: string): Promise<void> {
    try {
      const tmpDir = '/tmp/uploads';
      const fileNameSafe = originalKey.split('/').pop() || originalKey;
      const ts = Date.now();
      const fs = await import('fs');
      const pdfBuf = await this.doSpaces.getObjectBuffer(originalKey);
      const pdfPath = path.join(tmpDir, `${ts}_${fileNameSafe}.pdf`);
      await fs.promises.writeFile(pdfPath, pdfBuf);
      const coverPath = path.join(tmpDir, `${ts}_pdf_cover.jpg`);
      // Try pdftoppm first (poppler-utils)
      try {
        const outPrefix = path.join(tmpDir, `${ts}_cover`);
        await execFile('pdftoppm', ['-jpeg', '-f', '1', '-singlefile', '-scale-to', '320', pdfPath, outPrefix], { timeout: 20000 });
        // pdftoppm produces outPrefix.jpg
        const ppmCover = `${outPrefix}.jpg`;
        await fs.promises.rename(ppmCover, coverPath).catch(async () => {
          // If rename fails, ensure file exists; else throw to fallback
          const stat = await fs.promises.stat(ppmCover).catch(() => null);
          if (!stat) throw new Error('pdftoppm did not produce output');
          await fs.promises.copyFile(ppmCover, coverPath);
        });
      } catch {
        // Fallback to ImageMagick convert if available
        try {
          // Render first page [0], set width ~320, white background for transparency
          await execFile('convert', ['-thumbnail', '320', `${pdfPath}[0]`, '-background', 'white', '-alpha', 'remove', '-alpha', 'off', coverPath], { timeout: 20000 });
        } catch {
          // Give up
          return;
        }
      }

      const coverBuf = await fs.promises.readFile(coverPath);
      await this.doSpaces.uploadFile(coverBuf, outputKey, 'image/jpeg');
      await this.doSpaces.setPublicRead(outputKey).catch(() => void 0);
      // Cleanup
      void fs.promises.unlink(pdfPath).catch(() => {});
      void fs.promises.unlink(coverPath).catch(() => {});
    } catch {
      // ignore
    }
  }
}
