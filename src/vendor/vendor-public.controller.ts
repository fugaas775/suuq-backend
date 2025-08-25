import { Controller, Get, Header, Param, ParseIntPipe, Optional, NotFoundException, Query } from '@nestjs/common';
import { VendorService } from './vendor.service';
import { UsersService } from '../users/users.service';
import { DoSpacesService } from '../media/do-spaces.service';
import { ProductsService } from '../products/products.service';

@Controller('vendors')
export class VendorPublicController {
  constructor(
    private readonly vendorService: VendorService,
    private readonly usersService: UsersService,
  private readonly productsService: ProductsService,
    @Optional() private readonly doSpacesService?: DoSpacesService,
  ) {}

  // Batch products for multiple vendors in one call
  @Get('products')
  async batchVendorProducts(
    @Query('vendorIds') vendorIdsParam: string,
    @Query('per_vendor') perVendor?: string,
    @Query('sort') sort?: string,
    @Query('view') view?: 'grid' | 'full',
  ) {
    const vendorIds = String(vendorIdsParam || '')
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!vendorIds.length) return { vendors: [] };
    const per = Math.min(Number(perVendor) || 10, 30);
    const v = view === 'full' ? 'full' : 'grid';

    const results = await Promise.all(
      vendorIds.map(async (vendorId) => {
  const res = await this.productsService.findFiltered({ perPage: per, sort: sort || 'created_desc', vendorId, view: v } as any);
        return { vendorId, items: res.items };
      }),
    );
    return { vendors: results };
  }

  // Safer path to avoid conflicts with dynamic ':id' routes across controllers
  // Prefer using this endpoint going forward: /api/vendors/products/batch
  @Get('products/batch')
  async batchVendorProductsSafe(
    @Query('vendorIds') vendorIdsParam: string,
    @Query('per_vendor') perVendor?: string,
    @Query('sort') sort?: string,
    @Query('view') view?: 'grid' | 'full',
  ) {
    const vendorIds = String(vendorIdsParam || '')
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!vendorIds.length) return { vendors: [] };
    const per = Math.min(Number(perVendor) || 10, 30);
    const v = view === 'full' ? 'full' : 'grid';

    const results = await Promise.all(
      vendorIds.map(async (vendorId) => {
        const res = await this.productsService.findFiltered({ perPage: per, sort: sort || 'created_desc', vendorId, view: v } as any);
        return { vendorId, items: res.items };
      }),
    );
    return { vendors: results };
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
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
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
        const key = this.doSpacesService!.extractKeyFromUrl(it.url);
        if (!key) return it;
        try {
          const url = await this.doSpacesService!.getSignedUrl(key, ttl, {
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
