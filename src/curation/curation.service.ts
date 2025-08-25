import { Injectable, BadRequestException } from '@nestjs/common';
import { ProductsService } from '../products/products.service';

@Injectable()
export class CurationService {
  constructor(private readonly productsService: ProductsService) {}

  async getHome(opts: { perSection?: number; city?: string; region?: string; country?: string; view?: 'grid' | 'full' }) {
    const per = Math.min(Number(opts.perSection || 10) || 10, 20);
    const v = opts.view ?? 'grid';
    const [a, b] = await Promise.all([
      this.getSection('home-new', { limit: per, cursor: null, view: v }),
      this.getSection('home-best', { limit: per, cursor: null, view: v }),
    ]);
    return { newArrivals: a, bestSellers: b };
  }

  async getSection(key: string, opts: { limit?: number; cursor?: string | null; view?: 'grid' | 'full' }) {
    // Only allow curated keys per requirement
    const tagKey = key === 'home-new' || key === 'home-best' ? key : null;
    if (!tagKey) throw new BadRequestException('Unknown section');

    const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
    const page = decodeCursor(opts.cursor) || 1;

  // Ordering preference: curatedOrder ASC, curatedAt DESC, updatedAt DESC
  // Note: curated fields are not present; fallback sorts are used until fields exist
    const fallbackSort = tagKey === 'home-best' ? 'sales_desc' : 'created_desc';

    const res = await this.productsService.findFiltered({
      page,
      perPage: limit,
      sort: fallbackSort as any,
      tags: tagKey as any,
      view: opts.view,
    } as any);
    const nextCursor = page * limit < res.total ? encodeCursor(page + 1) : null;
    return { items: res.items, page, perPage: limit, total: res.total, nextCursor };
  }
}

function encodeCursor(page: number): string {
  return Buffer.from(String(page), 'utf8').toString('base64');
}
function decodeCursor(cursor?: string | null): number | null {
  if (!cursor) return null;
  try {
    const v = parseInt(Buffer.from(cursor, 'base64').toString('utf8'), 10);
    return Number.isFinite(v) && v > 0 ? v : 1;
  } catch {
    return 1;
  }
}
