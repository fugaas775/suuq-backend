import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Optional,
  NotFoundException,
  Query,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { VendorService } from './vendor.service';
import { SkipThrottle } from '@nestjs/throttler';
import { UsersService } from '../users/users.service';
import { DoSpacesService } from '../media/do-spaces.service';
import { ProductsService } from '../products/products.service';
import { normalizeProductMedia } from '../common/utils/media-url.util';
import { Response } from 'express';
import { RateLimitInterceptor } from '../common/interceptors/rate-limit.interceptor';
// ETag interceptor is registered globally in main.ts; avoid local decorator to prevent duplicate instantiation
@Controller('vendors')
export class VendorPublicController {
  constructor(
    private readonly vendorService: VendorService,
    private readonly usersService: UsersService,
    private readonly productsService: ProductsService,
    @Optional() private readonly doSpacesService?: DoSpacesService,
  ) {}

  // Lightweight per-process cache for batch vendor products (hot on home)
  private static readonly BATCH_TTL_MS = 30_000; // 30s to match Cache-Control
  private static readonly BATCH_CACHE_MAX = 200;
  private static readonly BATCH_CACHE: Map<string, { data: any; lastModified?: string; expiresAt: number }> =
    new Map();

  private makeBatchKey(params: { vendorIds: number[]; per: number; sort?: string; view?: string }): string {
    const ids = [...(params.vendorIds || [])].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
    const v = params.view === 'grid' ? 'grid' : 'full';
    return `ids=${ids.join(',')}&per=${params.per}&sort=${params.sort || 'created_desc'}&view=${v}`;
  }

  // Batch products for multiple vendors in one call
  @SkipThrottle()
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  @Get('products')
  @UseInterceptors(new RateLimitInterceptor({ maxRps: 15, burst: 30, keyBy: 'userOrIp', scope: 'route', headers: true }))
  async batchVendorProducts(
    @Query('vendorIds') vendorIdsParam: string,
    @Query('per_vendor') perVendor?: string,
    @Query('sort') sort?: string,
    @Query('view') view?: 'grid' | 'full',
    @Res({ passthrough: true }) res?: Response,
  ) {
    const vendorIds = String(vendorIdsParam || '')
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!vendorIds.length) return { vendors: [] };
    const per = Math.min(Number(perVendor) || 10, 30);
    // Default to 'full' so images relation is loaded and thumbnails are reliable
    const v = view === 'grid' ? 'grid' : 'full';

    const now = Date.now();
    const cacheKey = this.makeBatchKey({ vendorIds, per, sort, view: v });
    const cached = VendorPublicController.BATCH_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      if (cached.lastModified && res) res.setHeader('Last-Modified', cached.lastModified);
      return cached.data;
    }

    const results = await Promise.all(
      vendorIds.map(async (vendorId) => {
        const res = await this.productsService.findFiltered({
          perPage: per,
          sort: sort || 'created_desc',
          vendorId,
          view: v,
        } as any);
        const items = Array.isArray((res as any).items)
          ? (res as any).items.map(normalizeProductMedia)
          : [];
        return { vendorId, items };
      }),
    );
    // Compute Last-Modified across all returned items
    const newest = Math.max(
      -Infinity,
      ...results.flatMap((g) => g.items.map((it: any) => new Date(it?.createdAt).getTime())).filter((n) => Number.isFinite(n)),
    );
    const lastModified = Number.isFinite(newest) && newest > 0 ? new Date(newest).toUTCString() : undefined;
    if (lastModified && res) res.setHeader('Last-Modified', lastModified);

    const payload = { vendors: results };
    // Evict if over cap; simple FIFO
    if (VendorPublicController.BATCH_CACHE.size >= VendorPublicController.BATCH_CACHE_MAX) {
      const firstKey = VendorPublicController.BATCH_CACHE.keys().next().value as string | undefined;
      if (firstKey) VendorPublicController.BATCH_CACHE.delete(firstKey);
    }
    VendorPublicController.BATCH_CACHE.set(cacheKey, {
      data: payload,
      lastModified,
      expiresAt: now + VendorPublicController.BATCH_TTL_MS,
    });

    return payload;
  }

  // Safer path to avoid conflicts with dynamic ':id' routes across controllers
  // Prefer using this endpoint going forward: /api/vendors/products/batch
  @SkipThrottle()
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  @Get('products/batch')
  @UseInterceptors(new RateLimitInterceptor({ maxRps: 15, burst: 30, keyBy: 'userOrIp', scope: 'route', headers: true }))
  async batchVendorProductsSafe(
    @Query('vendorIds') vendorIdsParam: string,
    @Query('per_vendor') perVendor?: string,
    @Query('sort') sort?: string,
    @Query('view') view?: 'grid' | 'full',
    @Res({ passthrough: true }) res?: Response,
  ) {
    const vendorIds = String(vendorIdsParam || '')
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!vendorIds.length) return { vendors: [] };
    const per = Math.min(Number(perVendor) || 10, 30);
    // Default to 'full' so images relation is loaded and thumbnails are reliable
    const v = view === 'grid' ? 'grid' : 'full';
    const now = Date.now();
    const cacheKey = this.makeBatchKey({ vendorIds, per, sort, view: v });
    const cached = VendorPublicController.BATCH_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      if (cached.lastModified && res) res.setHeader('Last-Modified', cached.lastModified);
      return cached.data;
    }

    const results = await Promise.all(
      vendorIds.map(async (vendorId) => {
        const res = await this.productsService.findFiltered({
          perPage: per,
          sort: sort || 'created_desc',
          vendorId,
          view: v,
        } as any);
        const items = Array.isArray((res as any).items)
          ? (res as any).items.map(normalizeProductMedia)
          : [];
        return { vendorId, items };
      }),
    );
    const newest = Math.max(
      -Infinity,
      ...results.flatMap((g) => g.items.map((it: any) => new Date(it?.createdAt).getTime())).filter((n) => Number.isFinite(n)),
    );
    const lastModified = Number.isFinite(newest) && newest > 0 ? new Date(newest).toUTCString() : undefined;
    if (lastModified && res) res.setHeader('Last-Modified', lastModified);

    const payload = { vendors: results };
    if (VendorPublicController.BATCH_CACHE.size >= VendorPublicController.BATCH_CACHE_MAX) {
      const firstKey = VendorPublicController.BATCH_CACHE.keys().next().value as string | undefined;
      if (firstKey) VendorPublicController.BATCH_CACHE.delete(firstKey);
    }
    VendorPublicController.BATCH_CACHE.set(cacheKey, {
      data: payload,
      lastModified,
      expiresAt: now + VendorPublicController.BATCH_TTL_MS,
    });

    return payload;
  }

  @Get(':id')
  async getPublicProfile(@Param('id') id: number) {
    return this.vendorService.getPublicProfile(id);
  }

  // Simple vendor suggestion for admin dropdowns and client search
  @Get('suggest')
  async suggestVendors(@Query('q') q?: string, @Query('limit') limit?: string) {
    const lim = Math.min(Number(limit) || 10, 50);
    return this.vendorService.suggestVendors(q, lim);
  }

  // Public endpoint to fetch approved verification certificates for a vendor
  @Get(':id/certificates')
  @Header('Cache-Control', 'public, max-age=300')
  async getCertificates(@Param('id', ParseIntPipe) id: number) {
    const user = await this.vendorService.getPublicProfile(id);
    if (!user) {
      throw new NotFoundException({
        code: 'VENDOR_NOT_FOUND',
        message: 'Vendor not found',
      });
    }
    const items = await this.usersService.getPublicCertificates(id);
    const mapped = items.map((it) => ({
      id: undefined,
      name: it.name,
      type: 'BUSINESS_LICENSE',
      mimeType: undefined,
      url: it.url,
      thumbnailUrl: undefined,
      status: 'APPROVED',
      issuedBy: undefined,
      issueDate: undefined,
      expiryDate: undefined,
      uploadedAt: undefined,
    }));
    const shouldSign = process.env.DO_SPACES_SIGN_PUBLIC === 'true';
    if (!shouldSign || !this.doSpacesService) return { items: mapped };

    const ttl = parseInt(process.env.DO_SPACES_PUBLIC_SIGN_TTL || '300', 10);
    const signed = await Promise.all(
      mapped.map(async (it) => {
        const key = this.doSpacesService.extractKeyFromUrl(it.url);
        if (!key) return it;
        try {
          const url = await this.doSpacesService.getSignedUrl(key, ttl, {
            inlineFilename: it.name,
          });
          return { ...it, url };
        } catch {
          return it; // fallback to original if signing fails
        }
      }),
    );
    return { items: signed };
  }
}
