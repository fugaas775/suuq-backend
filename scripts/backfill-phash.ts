/*
  Backfill perceptual hash (dHash 64-bit) for existing ProductImage rows.
  - Batches through rows with phash IS NULL
  - Computes phash using sharp (9x8 grayscale dHash)
  - Updates phash and phashAlgo='dhash64'
  - Logs progress, errors, and final stats

  Usage (one-time): yarn backfill:phash
  Env knobs:
    PHASH_BATCH: number of images per batch (default 100)
    PHASH_MAX_IMAGES: max total images to process in this run (default unlimited)
    PHASH_TIMEOUT_MS: HTTP fetch timeout per image (default 8000)
*/
import 'dotenv/config';
import axios from 'axios';
import sharpModule from 'sharp';
import dataSource from '../src/data-source';
import { Repository } from 'typeorm';
import { ProductImage } from '../src/products/entities/product-image.entity';

const sharp: any = (sharpModule as any)?.default ?? (sharpModule as any);

function now() {
  return new Date().toISOString();
}

async function computeDhash64(buf: Buffer): Promise<string> {
  const img = sharp(buf).grayscale().resize(9, 8, { fit: 'fill' });
  const raw = await img.raw().toBuffer(); // 72 bytes
  const bits: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = raw[y * 9 + x];
      const right = raw[y * 9 + x + 1];
      bits.push(left > right ? 1 : 0);
    }
  }
  let hex = '';
  for (let i = 0; i < 16; i++) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) {
      nibble = (nibble << 1) | bits[i * 4 + j];
    }
    hex += nibble.toString(16);
  }
  return hex.padStart(16, '0');
}

async function fetchImageBuffer(src: string, timeoutMs: number): Promise<Buffer | null> {
  try {
    if (!src) return null;
    // Basic sanity: support http(s); if it looks like a data URL or local path, try sharp directly
    if (/^https?:\/\//i.test(src)) {
      const res = await axios.get<ArrayBuffer>(src, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        headers: { 'User-Agent': 'suuq-phash-backfill/1.0' },
        maxRedirects: 3,
        validateStatus: (s) => s >= 200 && s < 400,
      });
      return Buffer.from(res.data as any);
    }
    // Try to let sharp read local path or data URI
    const buf = await sharp(src).toBuffer();
    return buf;
  } catch (e) {
    return null;
  }
}

async function main() {
  const BATCH = parseInt(process.env.PHASH_BATCH || '100', 10);
  const MAX = parseInt(process.env.PHASH_MAX_IMAGES || '0', 10) || Infinity;
  const TIMEOUT = parseInt(process.env.PHASH_TIMEOUT_MS || '8000', 10);

  await dataSource.initialize();
  const repo: Repository<ProductImage> = dataSource.getRepository(ProductImage);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let lastId = 0;

  console.log(`[${now()}] phash backfill start: batch=${BATCH} max=${Number.isFinite(MAX) ? MAX : '∞'} timeout=${TIMEOUT}ms`);
  while (processed < MAX) {
    const take = Math.min(BATCH, MAX - processed);
    const rows = await repo
      .createQueryBuilder('img')
      .where('img.id > :lastId', { lastId })
      .andWhere('(img.phash IS NULL OR img.phash = \'\')')
      .orderBy('img.id', 'ASC')
      .limit(take)
      .getMany();

    if (!rows.length) break;

    for (const r of rows) {
      lastId = r.id;
      processed++;
      try {
        const buf = await fetchImageBuffer(r.src, TIMEOUT);
        if (!buf || !buf.length) {
          skipped++;
          if (processed % 50 === 0) console.log(`[${now()}] skipped id=${r.id} src=${r.src?.slice(0, 60)}`);
          continue;
        }

        const phash = await computeDhash64(buf);
        await repo.update({ id: r.id }, { phash, phashAlgo: 'dhash64' });
        updated++;
      } catch (e: any) {
        errors++;
        console.warn(`[${now()}] error id=${r.id}: ${e?.message || e}`);
      }

      if (processed % 100 === 0) {
        console.log(
          `[${now()}] progress processed=${processed} updated=${updated} skipped=${skipped} errors=${errors}`,
        );
      }
      if (processed >= MAX) break;
    }
  }

  console.log(`[${now()}] phash backfill done: processed=${processed} updated=${updated} skipped=${skipped} errors=${errors}`);
  await dataSource.destroy();
}

main().catch((e) => {
  console.error(`[${now()}] fatal:`, e);
  process.exit(1);
});
