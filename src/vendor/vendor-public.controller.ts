import { Controller, Get, Header, Param, ParseIntPipe, Optional, NotFoundException } from '@nestjs/common';
import { VendorService } from './vendor.service';
import { UsersService } from '../users/users.service';
import { DoSpacesService } from '../media/do-spaces.service';

@Controller('vendors')
export class VendorPublicController {
  constructor(
    private readonly vendorService: VendorService,
    private readonly usersService: UsersService,
    @Optional() private readonly doSpacesService?: DoSpacesService,
  ) {}

  @Get(':id')
  async getPublicProfile(@Param('id') id: number) {
    return this.vendorService.getPublicProfile(id);
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
