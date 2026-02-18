// ...existing imports...
import { CreateVendorProductDto } from './dto/create-vendor-product.dto';
import { UpdateVendorProductDto } from './dto/update-vendor-product.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus } from '../orders/entities/order.entity';
import { AuthenticatedRequest } from '../auth/auth.types';
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
  BadRequestException,
} from '@nestjs/common';
import { VendorService } from './vendor.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { VendorPermissionGuard } from './guards/vendor-permission.guard';
import { ActiveVendor } from '../common/decorators/active-vendor.decorator';
import { RequireVendorPermission } from './decorators/vendor-permission.decorator';
import { VendorPermission } from './vendor-permissions.enum';
import { User } from '../users/entities/user.entity';

@Controller()
export class VendorController {
  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.VIEW_ANALYTICS)
  @Get('vendor/sales-graph')
  async getSalesGraph(
    @Query('range') range: string,
    @Query('status') status: string,
    @ActiveVendor() vendor: User,
  ) {
    const graphData = await this.vendorService.getSalesGraphData(
      vendor.id,
      range,
      status,
    );
    return { points: graphData };
  }
  constructor(private readonly vendorService: VendorService) {}

  @Get('vendors')
  async findPublicVendors(
    @Query('q') q?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('sort')
    sort: 'name' | 'recent' | 'popular' | 'verifiedAt' = 'recent',
    @Query('verificationStatus')
    verificationStatus?: 'APPROVED' | 'PENDING' | 'REJECTED',
    @Query('role') role?: 'VENDOR',
  ) {
    const { items, total, currentPage } =
      await this.vendorService.findPublicVendors({
        page: Number(page) || 1,
        limit: Math.min(Number(limit) || 20, 100),
        search: q,
        sort,
        verificationStatus,
        role,
      } as any);

    return {
      items,
      page: currentPage,
      limit: Math.min(Number(limit) || 20, 100),
      total,
    };
  }

  @Get('vendors/:id')
  async getPublicProfile(@Param('id', ParseIntPipe) id: number) {
    return this.vendorService.getPublicProfile(Number(id));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Get('vendor/dashboard')
  async getDashboardOverview(
    @Req() req: any,
    @Query('status') status?: string,
  ) {
    return this.vendorService.getDashboardOverview(req.user.id, status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  @Get('vendor/products')
  async getVendorProducts(
    @Req() req: any,
    @Query('currency') currency?: string,
    @Query('search') search?: string,
  ) {
    return this.vendorService.getVendorProducts(req.user.id, currency, search);
  }

  // New: managed listing with search + publish status filters and pagination
  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.MANAGE_PRODUCTS)
  @Get('vendor/products/manage')
  async getVendorProductsManage(
    @ActiveVendor() vendor: User,
    @Query()
    q: import('./dto/vendor-products-query.dto').VendorProductsQueryDto,
  ) {
    return this.vendorService.getVendorProductsManage(vendor.id, q);
  }

  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.MANAGE_PRODUCTS)
  @Post('vendor/products')
  async createMyProduct(
    @ActiveVendor() vendor: User,
    @Body() dto: CreateVendorProductDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.vendorService.createMyProduct(vendor.id, dto, req.user as any);
  }

  // Fetch a single product owned by the current vendor (for edit prefill)
  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.MANAGE_PRODUCTS)
  @Get('vendor/products/:productId')
  async getMyProduct(
    @ActiveVendor() vendor: User,
    @Param('productId', ParseIntPipe) productId: number,
    @Query('playable') playable?: string,
    @Query('ttl') ttl?: string,
  ) {
    const wantsPlayable =
      String(playable || '').trim() === '1' ||
      /^(true|yes)$/i.test(String(playable || ''));
    const ttlSecs = Math.max(
      60,
      Math.min(parseInt(String(ttl || '300'), 10) || 300, 3600),
    );
    return this.vendorService.getMyProduct(vendor.id, productId, {
      playable: wantsPlayable,
      ttlSecs,
    });
  }

  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.MANAGE_PRODUCTS)
  @Delete('vendor/products/:productId')
  async deleteMyProduct(
    @ActiveVendor() vendor: User,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.vendorService.deleteMyProduct(vendor.id, productId);
  }

  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.MANAGE_PRODUCTS)
  @Patch('vendor/products/:productId')
  async updateMyProduct(
    @ActiveVendor() vendor: User,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: UpdateVendorProductDto,
  ) {
    return this.vendorService.updateMyProduct(vendor.id, productId, dto);
  }

  // Quick publish/unpublish toggle
  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.MANAGE_PRODUCTS)
  @Patch('vendor/products/:productId/publish')
  async togglePublish(
    @ActiveVendor() vendor: User,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() body: { publish?: boolean; status?: 'publish' | 'draft' },
  ) {
    const desired =
      typeof body?.publish === 'boolean'
        ? body.publish
          ? 'publish'
          : 'draft'
        : body?.status || 'publish';
    return this.vendorService.setPublishStatus(vendor.id, productId, desired);
  }

  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.VIEW_FINANCE)
  @Get('vendor/sales')
  getSales(@ActiveVendor() vendor: User) {
    return this.vendorService.getSales(vendor.id);
  }

  // Allow vendors to search available deliverers (users with DELIVERER role)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR, UserRole.CUSTOMER)
  @Get('vendor/deliverers')
  async searchDeliverers(
    @Query('q') q?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
  ) {
    const { items, total, hasMore } = await this.vendorService.searchDeliverers(
      {
        q: q || '',
        page: Number(page) || 1,
        limit: Math.min(Number(limit) || 20, 100),
        lat: lat != null ? Number(lat) : undefined,
        lng: lng != null ? Number(lng) : undefined,
        radiusKm: radiusKm != null ? Number(radiusKm) : undefined,
      },
    );
    return {
      items,
      total,
      page: Number(page) || 1,
      limit: Math.min(Number(limit) || 20, 100),
      hasMore: !!hasMore,
    };
  }

  // ===== Vendor Orders =====
  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.VIEW_ORDERS)
  @Get('vendor/orders')
  async getVendorOrders(
    @ActiveVendor() vendor: User,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: OrderStatus,
    @Query('currency') currency?: string,
  ) {
    return this.vendorService.getVendorOrders(vendor.id, {
      page: Number(page),
      limit: Number(limit),
      status,
      currency,
    });
  }

  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.VIEW_ORDERS)
  @Get('vendor/orders/:orderId')
  async getVendorOrder(
    @ActiveVendor() vendor: User,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Query('currency') currency?: string,
  ) {
    return this.vendorService.getVendorOrder(vendor.id, orderId, currency);
  }

  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.MANAGE_ORDERS)
  @Patch('vendor/orders/:orderId/status')
  async updateOrderStatus(
    @ActiveVendor() vendor: User,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.vendorService.updateOrderStatus(vendor.id, orderId, dto.status);
  }

  // Vendor assigns a deliverer to an order they fully own
  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.MANAGE_ORDERS)
  @Patch('vendor/orders/:orderId/assign-deliverer')
  async vendorAssignDeliverer(
    @ActiveVendor() vendor: User,
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
      throw new BadRequestException('delivererId is required');
    }
    return this.vendorService.assignDelivererByVendor(
      vendor.id,
      orderId,
      delivererId,
    );
  }

  // ===== Item-level endpoints =====
  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.VIEW_ORDERS)
  @Get('vendor/orders/:orderId/items')
  async getVendorOrderItems(
    @ActiveVendor() vendor: User,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.vendorService.getVendorOrderItems(vendor.id, orderId);
  }

  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.MANAGE_ORDERS)
  @Patch('vendor/orders/:orderId/items/:itemId/status')
  async updateOrderItemStatus(
    @ActiveVendor() vendor: User,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body()
    dto: import('./dto/update-order-item-status.dto').UpdateOrderItemStatusDto,
  ) {
    return this.vendorService.updateOrderItemStatus(
      vendor.id,
      orderId,
      itemId,
      dto.status,
    );
  }

  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.MANAGE_ORDERS)
  @Patch('vendor/orders/:orderId/items/:itemId/tracking')
  async updateOrderItemTracking(
    @ActiveVendor() vendor: User,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body()
    dto: import('./dto/update-order-item-tracking.dto').UpdateOrderItemTrackingDto,
  ) {
    return this.vendorService.updateOrderItemTracking(
      vendor.id,
      orderId,
      itemId,
      dto,
    );
  }

  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.MANAGE_ORDERS)
  @Post('vendor/orders/:orderId/shipments')
  async createShipment(
    @ActiveVendor() vendor: User,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: import('./dto/create-shipment.dto').CreateShipmentDto,
  ) {
    return this.vendorService.createShipment(vendor.id, orderId, dto.items, {
      trackingCarrier: dto.trackingCarrier,
      trackingNumber: dto.trackingNumber,
      trackingUrl: dto.trackingUrl,
    });
  }

  @UseGuards(JwtAuthGuard, VendorPermissionGuard)
  @RequireVendorPermission(VendorPermission.MANAGE_ORDERS)
  @Post('vendor/orders/:orderId/label')
  async generateLabel(
    @ActiveVendor() vendor: User,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: import('./dto/generate-label.dto').GenerateLabelDto,
  ) {
    return this.vendorService.generateLabel(vendor.id, orderId, dto);
  }
}
