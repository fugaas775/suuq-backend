import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as path from 'path';
import { DoSpacesService } from './do-spaces.service';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { MediaCleanupTask } from './entities/media-cleanup-task.entity';
import { Between, In, Like, Not } from 'typeorm';

const execFile = promisify(_execFile);

@Injectable()
export class MediaMaintenanceService {
  private readonly log = new Logger(MediaMaintenanceService.name);

  constructor(
    private readonly doSpaces: DoSpacesService,
    private readonly dataSource: DataSource,
    @InjectRepository(MediaCleanupTask)
    private readonly cleanupRepo: Repository<MediaCleanupTask>,
    @InjectRepository(UiSetting)
    private readonly settingsRepo: Repository<UiSetting>,
  ) {}

  /**
   * Cleans up inactive verification files based on the "Orphaned Files" strategy.
   * Logic:
   * 1. Fetches all User.verificationDocuments from the DB.
   * 2. Iterates S3 objects in the `verification/` prefix.
   * 3. Deletes any S3 object key that is NOT referenced in the DB.
   * 
   * This effectively keeps only the "last/approved" files stored in the DB.
   * Scheduling: Weekly (Sunday 2 AM) to avoid heavy load during peak.
   */
  @Cron('0 2 * * 0') // "At 02:00 on Sunday"
  async cleanupOrphanedVerifications() {
    // Check for PM2 instance ID to prevent multiple executions in cluster mode in production
    // '0' is usually the first instance. ParseInt to be safe.
    if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') {
        return;
    }

    this.log.log('Starting Cleanup of Orphaned Verification Files...');
    try {
      // 1. Collect all "valid" file keys from the Database
      // We manually construct the User query to separate concerns
      const result = await this.dataSource.query(
        `SELECT "verificationDocuments" FROM "user" WHERE "verificationDocuments" IS NOT NULL AND jsonb_array_length("verificationDocuments") > 0`
      );

      // Extract all URLs into a Set of Keys
      // verificationDocuments is [{ url: '...', name: '...' }]
      const validKeys = new Set<string>();

      for (const row of result) {
        const docs = row.verificationDocuments;
        if (Array.isArray(docs)) {
          for (const doc of docs) {
            if (doc && typeof doc.url === 'string') {
               // The DB stores full URL. We need to extract the "key".
               // URL: https://bucket.region.cdn.../verification/123/xxx.jpg
               // Key: verification/123/xxx.jpg
               // Strategy: find substring starting with "verification/"
               const match = doc.url.match(/(verification\/.*)/);
               if (match && match[1]) {
                 validKeys.add(match[1]);
               }
            }
          }
        }
      }

      this.log.log(`Found ${validKeys.size} valid verification file keys in DB.`);

      // 2. Iterate S3 objects in `verification/` prefix
      let continuationToken: string | undefined;
      let totalChecked = 0;
      let totalDeleted = 0;

      do {
        // List batch of 1000
        const { keys, nextToken } = await this.doSpaces.listKeys('verification/', 1000, continuationToken);
        continuationToken = nextToken;

        if (!keys || keys.length === 0) break;

        // 3. Compare and Delete
        for (const key of keys) {
          totalChecked++;
          
          // Skip folders (if listed)
          if (key.endsWith('/')) continue;

          // If key is NOT in the valid set, it is inactive/orphaned -> Delete
          if (!validKeys.has(key)) {
            try {
              this.log.debug(`Deleting orphaned file: ${key}`);
              await this.doSpaces.deleteObject(key);
              totalDeleted++;
            } catch (delErr) {
              this.log.error(`Failed to delete object ${key}`, delErr);
            }
          }
        }
        
      } while (continuationToken);

      this.log.log(`Cleanup Complete. Checked: ${totalChecked}. Deleted: ${totalDeleted} orphaned files.`);

    } catch (e: any) {
      this.log.error('Cleanup Orphanded Verifications Failed', e);
    }
  }

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

  /**
   * Processes the MediaCleanupTask queue every Sunday at 3:00 AM.
   * Offloads the actual S3 deletion of files from products/resources deleted during the week.
   */
  @Cron('0 3 * * 0') // "At 03:00 on Sunday"
  async cleanupDeletedProducts() {
    // Prevent concurrent execution across PM2 instances
    if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') {
        return;
    }

    this.log.log('Starting Cleanup of Deleted Product Files...');
    try {
      // Process in batches of 100 to avoid memory pressure or timeouts
      const batchSize = 100;
      let processed = 0;
      let deleted = 0;

      while (true) {
        const tasks = await this.cleanupRepo.find({
          take: batchSize,
          order: { createdAt: 'ASC' },
        });

        if (tasks.length === 0) break;

        for (const task of tasks) {
          try {
            await this.doSpaces.deleteObject(task.key);
            deleted++;
            // Delete the task record only after S3 delete succeeds (or if it wasn't found - which deleteObject usually handles gracefully)
            await this.cleanupRepo.remove(task);
          } catch (e: any) {
            this.log.error(
              `Failed to delete key ${task.key} for task ${task.id}`,
              e,
            );
            // If it's a permanent error, maybe we should delete the task anyway?
            // For now, leave it to retry next week or manual intervention.
          }
          processed++;
        }

        // Small pause between batches if needed, but not strictly necessary for 100 items
      }

      this.log.log(
        `Deleted Product Files Cleanup Complete. Processed: ${processed}, Deleted from S3: ${deleted}`,
      );
    } catch (e: any) {
      this.log.error('Cleanup Deleted Products Failed', e);
    }
  }

  /**
   * Phased/Incremental scanner for historical product media.
   * Runs nightly to scan a small batch of keys from S3 root,
   * checks if they are "orphaned" (not in DB), and deletes them.
   * Uses `ui_setting` table to store the S3 continuation token.
   */
  @Cron('0 4 * * *') // "At 04:00 every day"
  async scanHistoricalProductMedia() {
    const instanceId = process.env.NODE_APP_INSTANCE;
    if (instanceId && instanceId !== '0') {
      return;
    }

    const BATCH_SIZE = 1000;
    const SETTING_KEY = 'media_cleanup_cursor_v1';
    
    this.log.log(`Starting Historical Media Scan on instance ${instanceId || 'single'}...`);

    try {
      // 1. Get Continuation Token
      let token: string | undefined;
      let setting = await this.settingsRepo.findOne({ where: { key: SETTING_KEY } });
      
      if (setting && setting.value) {
         token = setting.value as string;
         if (token === 'DONE') {
           this.log.log('Historical scan previously completed. Skipping.');
           return;
         }
      }

      // 2. List keys from S3 Root
      const { keys, nextToken } = await this.doSpaces.listKeys('', BATCH_SIZE, token);

      if (!keys || keys.length === 0) {
        this.log.log('No keys returned. Scan complete?');
        // Mark done gracefully using upsert pattern to avoid race conditions
        try {
          await this.settingsRepo
            .createQueryBuilder()
            .insert()
            .into(UiSetting)
            .values({ key: SETTING_KEY, value: 'DONE' } as any)
            .orUpdate(['value'], ['key'])
            .execute();
        } catch (err) {
          this.log.warn(`Failed to save DONE token: ${err.message}`);
        }
        return;
      }

      // 3. Filter for Product Media Candidates
      const candidates = keys.filter(k => 
        !k.endsWith('/') && 
        (k.startsWith('full_') || k.startsWith('thumb_') || k.startsWith('lowres_') || k.startsWith('poster_'))
      );

      this.log.log(`Scanned ${keys.length} keys. Found ${candidates.length} candidates for product media.`);

      if (candidates.length > 0) {
        const CHUNK = 50;
        let deletedCount = 0;

        for (let i = 0; i < candidates.length; i += CHUNK) {
            const chunk = candidates.slice(i, i + CHUNK);
            await Promise.all(chunk.map(async (key) => {
                const term = `%${key}`;
                const pCount = await this.dataSource.query(
                    `SELECT 1 FROM product WHERE "imageUrl" LIKE $1 LIMIT 1`, 
                    [term]
                );
                if (pCount.length > 0) return; 

                const piCount = await this.dataSource.query(
                    `SELECT 1 FROM product_image WHERE src LIKE $1 OR "thumbnailSrc" LIKE $1 OR "lowResSrc" LIKE $1 LIMIT 1`,
                    [term]
                );
                if (piCount.length > 0) return;

                const attrCount = await this.dataSource.query(
                    `SELECT 1 FROM product WHERE attributes::text LIKE $1 LIMIT 1`,
                    [term]
                );
                if (attrCount.length > 0) return;

                try {
                   this.log.debug(`Deleting historical orphan: ${key}`);
                   await this.doSpaces.deleteObject(key);
                   deletedCount++;
                } catch(e) {
                   this.log.error(`Failed to delete ${key}`, e);
                }
            }));
        }
        this.log.log(`Batch complete. Deleted ${deletedCount}/${candidates.length} candidates.`);
      }

      // 5. Save Token safely
      const valToSave = nextToken || 'DONE';
      try {
        await this.settingsRepo
          .createQueryBuilder()
          .insert()
          .into(UiSetting)
          .values({ key: SETTING_KEY, value: valToSave } as any)
          .orUpdate(['value'], ['key'])
          .execute();
      } catch (e: any) {
        this.log.warn(`Failed to save progress token: ${e.message}`);
      }

      if (!nextToken) this.log.log('Scan finished (no nextToken).');
      else this.log.log('Saving token for next run.');

    } catch (e: any) {
      this.log.error('Historical Media Scan Failed', e);
    }
  }
}
