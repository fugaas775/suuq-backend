import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as path from 'path';
import { DoSpacesService } from './do-spaces.service';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
const execFile = promisify(_execFile);

@Injectable()
export class MediaMaintenanceService {
  private readonly log = new Logger(MediaMaintenanceService.name);

  constructor(private readonly doSpaces: DoSpacesService) {}

  // Clean stray temp files hourly (older than 1 hour)
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupTmpUploads() {
    try {
      const fs = await import('fs');
      const dir = '/tmp/uploads';
      await fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
      const entries = await fs.promises.readdir(dir).catch(() => []);
      const cutoff = Date.now() - 60 * 60 * 1000; // 1h
      for (const name of entries) {
        const full = path.join(dir, name);
        try {
          const st = await fs.promises.stat(full);
          if (st.isFile() && st.mtimeMs < cutoff) {
            await fs.promises.unlink(full).catch(() => {});
          }
        } catch {
          // ignore
        }
      }
    } catch (e) {
      this.log.warn(
        `cleanupTmpUploads failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  // Optional backfill job: generate posters for older videos missing posters
  // Runs daily at 03:15
  @Cron('15 3 * * *')
  async backfillVideoPosters() {
    try {
      const maxVideoBytes = 150 * 1024 * 1024;
      // Scan a prefix if you use one; empty means whole bucket (be careful)
      let token: string | undefined;
      let scanned = 0;
      let generated = 0;
      do {
        const { keys, nextToken } = await this.doSpaces.listKeys(
          '',
          500,
          token,
        );
        token = nextToken;
        for (const key of keys) {
          // Simple heuristic: if key looks like a video and there is no poster_ sibling, generate it
          if (!/\.(mp4|mov|webm|mkv|3gp|3g2|m4v)$/i.test(key)) continue;
          const posterCandidate = `poster_${key.replace(/[^A-Za-z0-9._/-]/g, '_')}.jpg`;
          const exists = await this.doSpaces.headObjectExists(posterCandidate);
          if (exists) continue;
          const meta = await this.doSpaces.headObjectMeta(key);
          if (
            typeof meta?.contentLength === 'number' &&
            meta.contentLength > maxVideoBytes
          ) {
            continue;
          }
          // Generate poster best-effort
          await this.buildAndUploadPoster(
            key,
            posterCandidate,
            maxVideoBytes,
          ).catch(() => {});
          generated++;
          // Soft cap per run to avoid long jobs
          if (generated >= 50) break;
        }
        scanned += keys.length;
        if (generated >= 50) break;
      } while (token);
      this.log.log(
        `backfillVideoPosters scanned=${scanned} generated=${generated}`,
      );
    } catch (e) {
      this.log.warn(
        `backfillVideoPosters failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private async buildAndUploadPoster(
    originalKey: string,
    posterKey: string,
    maxBytes: number,
  ): Promise<void> {
    const fs = await import('fs');
    const tmpDir = '/tmp/uploads';
    await fs.promises.mkdir(tmpDir, { recursive: true }).catch(() => {});
    const fileNameSafe = originalKey.split('/').pop() || originalKey;
    const videoPath = path.join(tmpDir, `bf_${Date.now()}_${fileNameSafe}`);
    await this.doSpaces.downloadToFile(originalKey, videoPath);
    const stat = await fs.promises.stat(videoPath).catch(() => null);
    if (stat && stat.size > maxBytes) {
      void fs.promises.unlink(videoPath).catch(() => {});
      return;
    }
    const posterPath = path.join(tmpDir, `${posterKey.split('/').pop()}`);
    try {
      const args = [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        '00:00:01.000',
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=320:-1',
        posterPath,
      ];
      await execFile('ffmpeg', args, { timeout: 20000 });
    } catch {
      const fallback = [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=320:-1',
        posterPath,
      ];
      await execFile('ffmpeg', fallback, { timeout: 20000 });
    }
    const posterBuf = await fs.promises.readFile(posterPath);
    await this.doSpaces.uploadFile(posterBuf, posterKey, 'image/jpeg');
    void fs.promises.unlink(videoPath).catch(() => {});
    void fs.promises.unlink(posterPath).catch(() => {});
  }
}
