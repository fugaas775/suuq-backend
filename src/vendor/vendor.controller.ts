// ...existing imports...
import { CreateVendorProductDto } from './dto/create-vendor-product.dto';
import { UpdateVendorProductDto } from './dto/update-vendor-product.dto';
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Get('vendor/sales-graph')
  async getSalesGraph(@Query('range') range: string, @Req() req: any) {
    const userId = req.user.id;
    const graphData = await this.vendorService.getSalesGraphData(userId, range);
    return { points: graphData };
  }
  constructor(private readonly vendorService: VendorService) {}

  @Get('vendors')
  async findPublicVendors(
    @Query('q') q?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('sort') sort: 'name' | 'recent' | 'popular' | 'verifiedAt' = 'recent',
    @Query('verificationStatus') verificationStatus?: 'APPROVED' | 'PENDING' | 'REJECTED',
    @Query('role') role?: 'VENDOR',
  ) {
    const { items, total, currentPage, totalPages } = await this.vendorService.findPublicVendors({
      page: Number(page) || 1,
      limit: Math.min(Number(limit) || 20, 100),
      search: q,
      sort,
      verificationStatus,
      role,
    } as any);

    return { items, page: currentPage, limit: Math.min(Number(limit) || 20, 100), total };
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
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: UpdateVendorProductDto,
  ) {
    return this.vendorService.updateMyProduct(req.user.id, productId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Get('vendor/sales')
  getSales(@Req() req: any) {
    return this.vendorService.getSales(req.user.id);
  }
}