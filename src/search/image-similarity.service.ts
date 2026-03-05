import { Injectable, Logger } from '@nestjs/common';
import sharpModule from 'sharp';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductImage } from '../products/entities/product-image.entity';

const sharp: any = (sharpModule as any)?.default ?? (sharpModule as any);

@Injectable()
export class ImageSimilarityService {
  private readonly logger = new Logger(ImageSimilarityService.name);

  constructor(
    @InjectRepository(ProductImage)
    private readonly imgRepo: Repository<ProductImage>,
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
    const pc = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]; // popcount for 0..15
    let sum = 0;
    const len = Math.min(a.length, b.length, 16);
    for (let i = 0; i < len; i++) {
      const x = (parseInt(a[i], 16) ^ parseInt(b[i], 16)) & 0xf;
      sum += pc[x];
    }
    return sum;
  }

  private cache = new Map<
    string,
    {
      expires: number;
      payload: {
        productIds: number[];
        scores: Array<{ productId: number; distance: number }>;
        mode: string;
        timings?: any;
      };
    }
  >();
  private cacheMax = Math.max(
    32,
    parseInt(process.env.PHASH_CACHE_MAX || '256', 10),
  );
  private cacheTtlMs = Math.max(
    1000,
    parseInt(process.env.PHASH_CACHE_TTL_MS || String(10 * 60 * 1000), 10),
  );

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

  async searchSimilarByUpload(
    upload: Buffer,
    topK = 24,
  ): Promise<{
    productIds: number[];
    scores: Array<{ productId: number; distance: number }>;
    mode: string;
    timings?: {
      hashMs: number;
      scanMs: number;
      rankMs: number;
      totalMs: number;
    };
  }> {
    try {
      const t0 = Date.now();
      const qhash = await this.computeDhash64(upload);
      const cached = this.getFromCache(`${qhash}|k=${topK}`);
      if (cached) return cached;
      const limit = Math.max(
        500,
        Math.min(
          parseInt(process.env.MAX_PHASH_CANDIDATES || '2000', 10) || 2000,
          10000,
        ),
      );
      const t1 = Date.now();
      // Fetch candidates with non-null phash and published products only
      const rows = await this.imgRepo
        .createQueryBuilder('img')
        .innerJoin('img.product', 'product')
        .select(['img.product', 'img.phash'])
        .where('img.phash IS NOT NULL')
        .andWhere('product.status = :st AND product.isBlocked = false', {
          st: 'publish',
        })
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
        timings: {
          hashMs: t1 - t0,
          scanMs: t2 - t1,
          rankMs: t3 - t2,
          totalMs: t3 - t0,
        },
      };
      this.setCache(`${qhash}|k=${topK}`, payload);
      return payload;
    } catch (e) {
      this.logger.warn(
        `searchSimilarByUpload failed: ${(e as Error)?.message}`,
      );
      return { productIds: [], scores: [], mode: 'fallback' };
    }
  }

  async searchSimilarByProduct(
    productId: number,
    opts?: {
      topK?: number;
      maxDistance?: number;
      maxCandidates?: number;
      sameCategoryBoost?: number;
      sameCityBoost?: number;
      diversifyVendors?: boolean;
    },
  ): Promise<{
    matches: Array<{
      productId: number;
      distance: number;
      thumbnail?: string | null;
      lowRes?: string | null;
      src?: string | null;
    }>;
    fallbackImages: Array<{
      productId: number;
      thumbnail?: string | null;
      lowRes?: string | null;
      src?: string | null;
    }>;
    mode: string;
  }> {
    const topK = Math.min(Math.max(Number(opts?.topK) || 3, 1), 8);
    const maxDistance = Math.min(
      Math.max(Number(opts?.maxDistance) || 12, 1),
      64,
    );
    const sameCategoryBoost = Math.max(Number(opts?.sameCategoryBoost) || 2, 0);
    const sameCityBoost = Math.max(Number(opts?.sameCityBoost) || 1, 0);
    const diversifyVendors = opts?.diversifyVendors !== false;
    const maxCandidates = Math.max(
      200,
      Math.min(
        Number(opts?.maxCandidates) ||
          parseInt(process.env.MAX_PHASH_CANDIDATES || '2000', 10) ||
          2000,
        10000,
      ),
    );

    try {
      const baseRows = await this.imgRepo
        .createQueryBuilder('img')
        .innerJoin('img.product', 'product')
        .leftJoin('product.category', 'category')
        .leftJoin('product.vendor', 'vendor')
        .select([
          'img.phash AS phash',
          'category.id AS categoryId',
          "LOWER(COALESCE(product.listingCity, '')) AS listingCity",
          'vendor.id AS vendorId',
        ])
        .where('img.productId = :productId', { productId })
        .andWhere('img.phash IS NOT NULL')
        .andWhere('product.status = :st', { st: 'publish' })
        .andWhere('product.isBlocked = false')
        .orderBy('COALESCE(img.sortOrder, 999999)', 'ASC')
        .addOrderBy('img.id', 'ASC')
        .limit(3)
        .getRawMany();

      const fallbackRows = await this.imgRepo
        .createQueryBuilder('img')
        .select([
          'img.src AS src',
          'img.thumbnailSrc AS thumbnail',
          'img.lowResSrc AS lowRes',
          'img.id AS id',
        ])
        .where('img.productId = :productId', { productId })
        .orderBy('COALESCE(img.sortOrder, 999999)', 'ASC')
        .addOrderBy('img.id', 'ASC')
        .limit(topK + 2)
        .getRawMany();

      const fallbackImages = (fallbackRows || [])
        .slice(1)
        .slice(0, topK)
        .map((row: any) => ({
          productId,
          thumbnail: row?.thumbnail || null,
          lowRes: row?.lowRes || null,
          src: row?.src || null,
        }));

      if (!baseRows.length) {
        return { matches: [], fallbackImages, mode: 'no-base-phash' };
      }

      const baseHashes = (baseRows || [])
        .map((row: any) => String(row?.phash || '').trim())
        .filter((v: string) => !!v);
      if (!baseHashes.length) {
        return { matches: [], fallbackImages, mode: 'no-base-phash' };
      }

      const baseCategoryId = Number(baseRows[0]?.categoryId || 0) || null;
      const baseCity = String(baseRows[0]?.listingCity || '').trim();

      const candidateRows = await this.imgRepo
        .createQueryBuilder('img')
        .innerJoin('img.product', 'product')
        .leftJoin('product.category', 'category')
        .leftJoin('product.vendor', 'vendor')
        .select([
          'img.productId AS productId',
          'img.phash AS phash',
          'img.src AS src',
          'img.thumbnailSrc AS thumbnail',
          'img.lowResSrc AS lowRes',
          'category.id AS categoryId',
          "LOWER(COALESCE(product.listingCity, '')) AS listingCity",
          'vendor.id AS vendorId',
        ])
        .where('img.phash IS NOT NULL')
        .andWhere('img.productId <> :productId', { productId })
        .andWhere('product.status = :st', { st: 'publish' })
        .andWhere('product.isBlocked = false')
        .orderBy('img.id', 'DESC')
        .limit(maxCandidates)
        .getRawMany();

      if (!candidateRows.length) {
        return { matches: [], fallbackImages, mode: 'no-candidates' };
      }

      const bestByProduct = new Map<
        number,
        {
          productId: number;
          distance: number;
          score: number;
          categoryId: number | null;
          listingCity: string;
          vendorId: number | null;
          thumbnail?: string | null;
          lowRes?: string | null;
          src?: string | null;
        }
      >();

      for (const row of candidateRows) {
        const pid = Number(row?.productId || 0);
        const ph = String(row?.phash || '').trim();
        if (!pid || !ph) continue;

        let bestDistance = 65;
        for (const bh of baseHashes) {
          const d = this.hammingDistanceHex64(bh, ph);
          if (d < bestDistance) bestDistance = d;
          if (bestDistance === 0) break;
        }
        if (bestDistance > maxDistance) continue;

        const categoryId = Number(row?.categoryId || 0) || null;
        const listingCity = String(row?.listingCity || '').trim();
        const vendorId = Number(row?.vendorId || 0) || null;
        const score =
          bestDistance -
          (baseCategoryId && categoryId === baseCategoryId
            ? sameCategoryBoost
            : 0) -
          (baseCity && listingCity && listingCity === baseCity
            ? sameCityBoost
            : 0);

        const prev = bestByProduct.get(pid);
        if (
          !prev ||
          score < prev.score ||
          (score === prev.score && bestDistance < prev.distance)
        ) {
          bestByProduct.set(pid, {
            productId: pid,
            distance: bestDistance,
            score,
            categoryId,
            listingCity,
            vendorId,
            thumbnail: row?.thumbnail || null,
            lowRes: row?.lowRes || null,
            src: row?.src || null,
          });
        }
      }

      const sorted = Array.from(bestByProduct.values()).sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.productId - b.productId;
      });

      const uniqueVendor: typeof sorted = [];
      const vendorOverflow: typeof sorted = [];
      const seenVendors = new Set<number>();
      for (const item of sorted) {
        if (!diversifyVendors) {
          uniqueVendor.push(item);
          continue;
        }
        if (!item.vendorId || !seenVendors.has(item.vendorId)) {
          if (item.vendorId) seenVendors.add(item.vendorId);
          uniqueVendor.push(item);
        } else {
          vendorOverflow.push(item);
        }
      }

      const picked = [...uniqueVendor, ...vendorOverflow].slice(0, topK);
      return {
        matches: picked.map((item) => ({
          productId: item.productId,
          distance: item.distance,
          thumbnail: item.thumbnail || null,
          lowRes: item.lowRes || null,
          src: item.src || null,
        })),
        fallbackImages,
        mode: 'dhash64-product',
      };
    } catch (e) {
      this.logger.warn(
        `searchSimilarByProduct failed productId=${productId}: ${(e as Error)?.message}`,
      );
      return { matches: [], fallbackImages: [], mode: 'fallback' };
    }
  }
}
