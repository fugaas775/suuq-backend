// ...existing imports...
import { CreateVendorProductDto } from './dto/create-vendor-product.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus } from '../orders/entities/order.entity';
import {
  Controller,
  Get,
  Param,
  Query,
  Patch,
  Body,
  UseGuards,
  Req,
  Post,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { VendorService } from './vendor.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';

@Controller()
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Get('vendors')
  async findPublicVendors(@Query() query: any) {
    return this.vendorService.findPublicVendors(query);
  }

  @Get('vendors/:id')
  async getPublicProfile(@Param('id') id: number) {
    return this.vendorService.getPublicProfile(Number(id));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Get('vendor/dashboard')
  async getDashboardOverview(@Req() req: any) {
    return this.vendorService.getDashboardOverview(req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Get('vendor/products')
  async getVendorProducts(@Req() req: any) {
    return this.vendorService.getVendorProducts(req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Post('vendor/products')
  async createMyProduct(@Req() req: any, @Body() dto: CreateVendorProductDto) {
    return this.vendorService.createMyProduct(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Delete('vendor/products/:productId')
  async deleteMyProduct(
    @Req() req: any,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.vendorService.deleteMyProduct(req.user.id, productId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Patch('vendor/products/:productId')
  async updateMyProduct(
    @Req() req: any,
    @Param('productId') productId: number,
    @Body() dto: any, // Replace with UpdateVendorProductDto if available
  ) {
    return this.vendorService.updateMyProduct(req.user.id, Number(productId), dto);
  }
}