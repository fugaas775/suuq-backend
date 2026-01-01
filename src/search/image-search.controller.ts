import {
  Controller,
  Post,
  UseInterceptors,
  MaxFileSizeValidator,
  BadRequestException,
  Query,
  Res,
  UseFilters,
  UploadedFiles,
  ParseFilePipeBuilder,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { Response } from 'express';
import { RateLimitInterceptor } from '../common/interceptors/rate-limit.interceptor';
import { SkipThrottle } from '@nestjs/throttler';
import { ProductsService } from '../products/products.service';
import { toProductCard } from '../products/utils/product-card.util';
import { MulterExceptionFilter } from '../media/multer-exception.filter';
import { ImageSimilarityService } from './image-similarity.service';

@UseInterceptors(
  new RateLimitInterceptor({
    maxRps: 3,
    burst: 6,
    keyBy: 'userOrIp',
    scope: 'route',
    headers: true,
  }),
)
@SkipThrottle()
@Controller('search')
export class ImageSearchController {
  constructor(
    private readonly products: ProductsService,
    private readonly sim: ImageSimilarityService,
  ) {}

  /**
   * Temporary visual search endpoint (fallback mode):
   * Accepts an image upload and returns recommended products while we roll out similarity search.
   * - multipart/form-data field name: image
   * - query: topK (default 24)
   * - returns: items (ProductCard[]), total, perPage, currentPage, totalPages, headers include X-Image-Search-Mode=fallback
   */
  @Post('image')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @UseFilters(MulterExceptionFilter)
  async imageFallback(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Query('topK') topK?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    // Support field name 'file' (client) or 'image' (older)
    const file =
      (files || []).find((f) => f.fieldname === 'file') ||
      (files || [])[0] ||
      null;
    const img =
      file || (files || []).find((f) => f.fieldname === 'image') || null;
    if (!img) throw new BadRequestException('No image file provided.');

    // Validate size and mimetype
    const pipe = new ParseFilePipeBuilder()
      .addMaxSizeValidator({
        maxSize: 10 * 1024 * 1024,
        message: 'Please upload an image up to 10MB.',
      })
      .build({ fileIsRequired: true });
    await pipe.transform(img as any);
    const mime = img?.mimetype || '';
    if (!mime.startsWith('image/'))
      throw new BadRequestException('Only image uploads are supported.');

    const perPage = Math.min(
      Math.max(parseInt(String(topK || '24'), 10) || 24, 1),
      48,
    );

    // For now, return a high-quality fallback feed (best_match, grid) and mark response headers
    // Try similarity first; fallback if we have no indexed phashes
    let mode = 'fallback';
    let productIds: number[] = [];
    const t0 = Date.now();
    let timings: any = undefined;
    try {
      const buf: Buffer = (img as any).buffer
        ? Buffer.from((img as any).buffer)
        : await (await import('fs')).promises.readFile((img as any).path);
      const sim = await this.sim.searchSimilarByUpload(buf, perPage);
      productIds = sim.productIds;
      mode = sim.mode;
      timings = (sim as any)?.timings;
    } catch {}

    if (res) {
      res.setHeader('X-Image-Search-Mode', mode);
      res.setHeader('Cache-Control', 'no-store');
      const totalMs = Date.now() - t0;
      const t = timings
        ? { ...timings, endToEndMs: totalMs }
        : { endToEndMs: totalMs };
      res.setHeader('X-Image-Search-Timing', JSON.stringify(t));
    }

    let items: any[] = [];
    let result: any;
    if (productIds && productIds.length) {
      // Fetch products by ids and map to cards; maintain original order
      const products = await this.products.findManyByIds(productIds, {
        view: 'grid',
      });
      const byId = new Map(products.map((p: any) => [p.id, p]));
      items = productIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map(toProductCard);
      result = {
        items,
        total: items.length,
        perPage,
        currentPage: 1,
        totalPages: 1,
      };
    } else {
      // Fallback curated feed
      result = await this.products.findFiltered({
        perPage,
        sort: 'best_match',
        view: 'grid',
      } as any);
      items = (result.items || []).map(toProductCard);
      result = { ...result, items };
    }

    // Clean up temp file if stored on disk (best-effort)
    try {
      const fs = await import('fs');
      if ((img as any)?.path)
        void fs.promises.unlink((img as any).path).catch(() => {});
    } catch {}

    return result;
  }
}
