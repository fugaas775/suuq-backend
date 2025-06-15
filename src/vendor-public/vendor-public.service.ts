import { Injectable } from '@nestjs/common';
import { VendorService } from '../vendor/vendor.service';

@Injectable()
export class VendorPublicService {
  constructor(private readonly vendorService: VendorService) {}

  async getPublicProfile(vendorId: string | number) {
    return this.vendorService.getPublicProfile(vendorId);
  }
}