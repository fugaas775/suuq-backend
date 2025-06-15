import { Controller, Get, Param, NotFoundException, Patch, Body, Post } from '@nestjs/common';
import { VendorService } from './vendor.service';
import { Vendor } from './entities/vendor.entity';

@Controller('vendor')
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Get(':id')
  async findById(@Param('id') id: string) {
    const vendor = await this.vendorService.findById(id);
    if (!vendor) throw new NotFoundException('Vendor not found.');
    return vendor;
  }

  @Get()
  async findAll() {
    return this.vendorService.findAll();
  }

  @Post()
  async create(@Body() data: Partial<Vendor>) {
    return this.vendorService.create(data);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: Partial<Vendor>) {
    const updated = await this.vendorService.update(id, data);
    if (!updated) throw new NotFoundException('Vendor not found.');
    return updated;
  }
}