import { Controller, Post, Patch, Body, Get, Param, Req, ParseIntPipe, Query, UseGuards, Request } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { OrderStatus } from './order.entity';
import { UserRole } from '../constants/roles'; // Add this import

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.CUSTOMER)
  create(@Body() body: any, @Request() req: any) {
    const customerEmail = req.user.email;
    return this.ordersService.create({ ...body, customerEmail });
  }

  @Get('my-orders')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.CUSTOMER)
  getCustomerOrders(
    @Req() req: any,
    @Query('status') status?: OrderStatus
  ) {
    return this.ordersService.getCustomerOrders(req.user.email, status);
  }

  @Get('vendor-orders')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR)
  getVendorOrders(
    @Req() req: any,
    @Query('status') status?: OrderStatus,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    return this.ordersService.getVendorOrders(req.user.id, status, from, to);
  }

  @Get('vendor-earnings')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR)
  getVendorEarnings(@Request() req: any) {
    return this.ordersService.getVendorEarnings(req.user.id);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  getOne(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.findOneByRole(+id, req.user);
  }

  @Get('sales/summary')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.ordersService.getAdminSalesSummary(from, to);
  }

  @Get('sales/top-products')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  getTopProducts(@Request() req: any) {
    return this.ordersService.getTopProducts(req.user);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR, UserRole.ADMIN)
  updateOrderStatus(
    @Param('id') id: number,
    @Body('status') status: OrderStatus,
    @Req() req: any
  ) {
    return this.ordersService.updateStatus(+id, status, req.user);
  }
}
