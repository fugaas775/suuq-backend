import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { VendorPublicService } from './vendor-public.service';

@Controller('vendors')
export class VendorPublicController {
  constructor(private readonly vendorPublicService: VendorPublicService) {}

  @Get(':id/profile')
  async getVendorPublicProfile(@Param('id') vendorId: string) {
    const vendor = await this.vendorPublicService.getPublicProfile(vendorId);
    if (!vendor) throw new NotFoundException('Vendor not found.');
    return vendor;
  }
}