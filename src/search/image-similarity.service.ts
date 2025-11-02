import { Injectable, Logger } from '@nestjs/common';
import sharpModule from 'sharp';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductImage } from '../products/entities/product-image.entity';
import { ProductsService } from '../products/products.service';

const sharp: any = (sharpModule as any)?.default ?? (sharpModule as any);

@Injectable()
export class ImageSimilarityService {
  private readonly logger = new Logger(ImageSimilarityService.name);

  constructor(
    @InjectRepository(ProductImage) private readonly imgRepo: Repository<ProductImage>,
    private readonly products: ProductsService,
  ) {}

  // Compute a 64-bit dHash (hex string length 16)
  async computeDhash64(buf: Buffer): Promise<string> {
    const limitInputPixels = Math.max(
      1,
      parseInt(process.env.PHASH_LIMIT_INPUT_PIXELS || '40000000', 10),
    );
    // Resize to 9x8 grayscale then compare adjacent pixels horizontally
    const img = sharp(buf, { sequentialRead: true, limitInputPixels })
      .grayscale()
      .resize(9, 8, { fit: 'fill', fastShrinkOnLoad: true });
    const raw = await img.raw().toBuffer(); // 9*8 = 72 bytes, 1 channel
    const bits: number[] = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left = raw[y * 9 + x];
        const right = raw[y * 9 + x + 1];
        const v = left > right ? 1 : 0;
        bits.push(v);
      }
    }
    // Convert 64 bits to 16 hex chars (4 bits each)
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

  hammingDistanceHex64(a: string, b: string): number {
    const pc = [
      0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4,
    ]; // popcount for 0..15
    let sum = 0;
    const len = Math.min(a.length, b.length, 16);
    for (let i = 0; i < len; i++) {
      const x = (parseInt(a[i], 16) ^ parseInt(b[i], 16)) & 0xf;
      sum += pc[x];
    }
    return sum;
  }

  private cache = new Map<string, { expires: number; payload: { productIds: number[]; scores: Array<{ productId: number; distance: number }>; mode: string; timings?: any } }>();
  private cacheMax = Math.max(32, parseInt(process.env.PHASH_CACHE_MAX || '256', 10));
  private cacheTtlMs = Math.max(1000, parseInt(process.env.PHASH_CACHE_TTL_MS || String(10 * 60 * 1000), 10));

  private getFromCache(key: string) {
    const v = this.cache.get(key);
    if (!v) return null;
    if (v.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return v.payload;
  }

  private setCache(key: string, payload: any) {
    // Evict oldest if over capacity
    if (this.cache.size >= this.cacheMax) {
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { expires: Date.now() + this.cacheTtlMs, payload });
  }

  async searchSimilarByUpload(upload: Buffer, topK = 24): Promise<{ productIds: number[]; scores: Array<{ productId: number; distance: number }>; mode: string; timings?: { hashMs: number; scanMs: number; rankMs: number; totalMs: number } }>{
    try {
      const t0 = Date.now();
      const qhash = await this.computeDhash64(upload);
      const cached = this.getFromCache(`${qhash}|k=${topK}`);
      if (cached) return cached;
      const limit = Math.max(500, Math.min(parseInt(process.env.MAX_PHASH_CANDIDATES || '2000', 10) || 2000, 10000));
      const t1 = Date.now();
      // Fetch candidates with non-null phash and published products only
      const rows = await this.imgRepo
        .createQueryBuilder('img')
        .innerJoin('img.product', 'product')
        .select(['img.product', 'img.phash'])
        .where('img.phash IS NOT NULL')
        .andWhere('product.status = :st AND product.isBlocked = false', { st: 'publish' })
        .orderBy('img.id', 'DESC')
        .limit(limit)
        .getMany();

      if (!rows.length) return { productIds: [], scores: [], mode: 'fallback' };

      // Compute distances and keep the best id per product (minimum distance across its images)
      const t2 = Date.now();
      const bestByProduct = new Map<number, number>();
      for (const r of rows) {
        const pid = (r as any).product?.id as number | undefined;
        const ph = (r as any).phash as string | undefined;
        if (!pid || !ph) continue;
        const d = this.hammingDistanceHex64(qhash, ph);
        const prev = bestByProduct.get(pid);
        if (prev === undefined || d < prev) bestByProduct.set(pid, d);
      }

      const sorted = Array.from(bestByProduct.entries())
        .map(([productId, distance]) => ({ productId, distance }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, topK);
      const t3 = Date.now();
      const payload = {
        productIds: sorted.map((s) => s.productId),
        scores: sorted,
        mode: 'dhash64' as const,
        timings: { hashMs: t1 - t0, scanMs: t2 - t1, rankMs: t3 - t2, totalMs: t3 - t0 },
      };
      this.setCache(`${qhash}|k=${topK}`, payload);
      return payload;
    } catch (e) {
      this.logger.warn(`searchSimilarByUpload failed: ${(e as Error)?.message}`);
      return { productIds: [], scores: [], mode: 'fallback' };
    }
  }
}
