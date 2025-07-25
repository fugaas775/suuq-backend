import { Controller, Get, Param } from '@nestjs/common';
import { VendorService } from './vendor.service';

@Controller('vendors')
export class VendorPublicController {
  constructor(private readonly vendorService: VendorService) {}

  @Get(':id')
  async getPublicProfile(@Param('id') id: number) {
    return this.vendorService.getPublicProfile(id);
  }
}
