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
  async getPublicProfile(@Param('id', ParseIntPipe) id: number) {
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

  // Allow vendors to search available deliverers (users with DELIVERER role)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Get('vendor/deliverers')
  async searchDeliverers(
    @Query('q') q?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const { items, total } = await this.vendorService.searchDeliverers({
      q: q || '',
      page: Number(page) || 1,
      limit: Math.min(Number(limit) || 20, 100),
    });
    return {
      items, // normalized to { id, name, email, phone }
      total,
      page: Number(page) || 1,
      limit: Math.min(Number(limit) || 20, 100),
    };
  }

  // ===== Vendor Orders =====
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Get('vendor/orders')
  async getVendorOrders(
    @Req() req: any,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: OrderStatus,
  ) {
    return this.vendorService.getVendorOrders(req.user.id, {
      page: Number(page),
      limit: Number(limit),
      status,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Get('vendor/orders/:orderId')
  async getVendorOrder(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.vendorService.getVendorOrder(req.user.id, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Patch('vendor/orders/:orderId/status')
  async updateOrderStatus(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.vendorService.updateOrderStatus(req.user.id, orderId, dto.status);
  }

  // Vendor assigns a deliverer to an order they fully own
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Patch('vendor/orders/:orderId/assign-deliverer')
  async vendorAssignDeliverer(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() body: any,
    @Query() query?: any,
  ) {
    const delivererId = Number(
      body?.delivererId ??
      body?.userId ??
      body?.deliverer_id ??
      body?.assigneeId ??
      body?.driverId ??
      body?.courierId ??
      query?.delivererId ??
      query?.userId,
    );
    if (!delivererId || Number.isNaN(delivererId)) {
      throw new (require('@nestjs/common') as any).BadRequestException('delivererId is required');
    }
    return this.vendorService.assignDelivererByVendor(req.user.id, orderId, delivererId);
  }

  // ===== Item-level endpoints =====
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Get('vendor/orders/:orderId/items')
  async getVendorOrderItems(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.vendorService.getVendorOrderItems(req.user.id, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Patch('vendor/orders/:orderId/items/:itemId/status')
  async updateOrderItemStatus(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: import('./dto/update-order-item-status.dto').UpdateOrderItemStatusDto,
  ) {
    return this.vendorService.updateOrderItemStatus(req.user.id, orderId, itemId, dto.status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Patch('vendor/orders/:orderId/items/:itemId/tracking')
  async updateOrderItemTracking(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: import('./dto/update-order-item-tracking.dto').UpdateOrderItemTrackingDto,
  ) {
    return this.vendorService.updateOrderItemTracking(req.user.id, orderId, itemId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Post('vendor/orders/:orderId/shipments')
  async createShipment(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: import('./dto/create-shipment.dto').CreateShipmentDto,
  ) {
    return this.vendorService.createShipment(req.user.id, orderId, dto.items, {
      trackingCarrier: dto.trackingCarrier,
      trackingNumber: dto.trackingNumber,
      trackingUrl: dto.trackingUrl,
    });
  }
}