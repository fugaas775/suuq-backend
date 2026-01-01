import { Controller, Get, Header, Param, Query, Logger } from '@nestjs/common';
import { CurationService } from './curation.service';

@Controller('curation')
export class CurationController {
  private readonly logger = new Logger(CurationController.name);
  constructor(private readonly curation: CurationService) {}

  // Public home aggregation
  @Get('home')
  @Header('Cache-Control', 'no-store')
  async home(
    @Query('limit') limit?: string,
    @Query('city') city?: string,
    @Query('region') region?: string,
    @Query('country') country?: string,
    @Query('currency') currency?: string,
    @Query('view') view?: 'grid' | 'full',
  ) {
    const per = Math.min(Number(limit) || 10, 20);
    const v = view === 'full' ? 'full' : 'grid';
    const [newSec, bestSec] = await Promise.all([
      this.curation.getSection('home-new', {
        limit: per,
        cursor: null,
        view: v,
        currency,
      }),
      this.curation.getSection('home-best', {
        limit: per,
        cursor: null,
        view: v,
        currency,
      }),
    ]);

    const newItems = newSec.items.map(normalizeProductImage);
    const bestItems = bestSec.items.map(normalizeProductImage);

    this.logger.log(
      `home counts newArrivals=${newItems.length} bestSellers=${bestItems.length} limit=${per}`,
    );

    return {
      newArrivals: {
        key: 'home-new',
        items: newItems,
        count: newItems.length,
        nextCursor: newSec.nextCursor,
      },
      bestSellers: {
        key: 'home-best',
        items: bestItems,
        count: bestItems.length,
        nextCursor: bestSec.nextCursor,
      },
      meta: { generatedAt: new Date().toISOString() },
    };
  }

  // Public curated section with cursor-based pagination
  @Get('section/:key')
  @Header('Cache-Control', 'no-store')
  async section(
    @Param('key') key: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('currency') currency?: string,
    @Query('view') view?: 'grid' | 'full',
  ) {
    const v = view === 'full' ? 'full' : 'grid';
    const res = await this.curation.getSection(key, {
      limit: Number(limit) || 20,
      cursor,
      view: v,
      currency,
    });
    const items = res.items.map(normalizeProductImage);
    this.logger.log(
      `section=${key} count=${items.length} limit=${limit ?? ''} cursor=${cursor ?? ''}`,
    );
    return { ...res, items };
  }
}

function normalizeProductImage(p: any) {
  // pick: thumbnailSrc || images[0].src || product.imageUrl
  let url: string | null = null;
  const firstImage =
    Array.isArray(p.images) && p.images.length ? p.images[0] : null;
  url =
    (firstImage?.thumbnailSrc as string) ||
    (firstImage?.src as string) ||
    (p.imageUrl as string) ||
    null;
  if (url) {
    p.imageUrl = absolutize(url);
  }
  return p;
}

function absolutize(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = process.env.MEDIA_BASE_URL || process.env.PUBLIC_BASE_URL || '';
  if (!base) return url; // fallback: leave as-is
  if (url.startsWith('/')) return `${base}${url}`;
  return `${base}/${url}`;
}
