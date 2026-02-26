import {
  Controller,
  Get,
  Req,
  UseGuards,
  UseInterceptors,
  Header,
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
import { RateLimitInterceptor } from '../common/interceptors/rate-limit.interceptor';

@Controller('vendor/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
export class VendorDashboardController {
  constructor(private readonly vendorService: VendorService) {}

  @Get('overview')
  @UseInterceptors(
    new RateLimitInterceptor({
      maxRps: 4,
      burst: 8,
      keyBy: 'userOrIp',
      scope: 'route',
      headers: true,
    }),
  )
  @Header('Cache-Control', 'private, max-age=10')
  async getDashboardOverview(@Req() req: any) {
    return this.vendorService.getDashboardOverview(req.user.id);
  }

  @Get('products')
  @UseInterceptors(
    new RateLimitInterceptor({
      maxRps: 4,
      burst: 8,
      keyBy: 'userOrIp',
      scope: 'route',
      headers: true,
    }),
  )
  @Header('Cache-Control', 'private, max-age=10')
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
