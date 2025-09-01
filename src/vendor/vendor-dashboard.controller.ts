import {
  Controller,
  Get,
  Req,
  UseGuards,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import { UpdateVendorProductDto } from './dto/update-vendor-product.dto';
import { VendorService } from './vendor.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';

@Controller('vendor/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
export class VendorDashboardController {
  constructor(private readonly vendorService: VendorService) {}

  @Get('overview')
  async getDashboardOverview(@Req() req: any) {
    return this.vendorService.getDashboardOverview(req.user.id);
  }

  @Get('products')
  async getVendorProducts(@Req() req: any) {
    return this.vendorService.getVendorProducts(req.user.id);
  }

  @Patch('products/:productId')
  async updateMyProduct(
    @Req() req: any,
    @Param('productId') productId: number,
    @Body() dto: UpdateVendorProductDto,
  ) {
    return this.vendorService.updateMyProduct(req.user.id, productId, dto);
  }
}
