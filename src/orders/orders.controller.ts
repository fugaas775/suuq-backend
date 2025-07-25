import { Controller, Get, Post, Body, Param, UseGuards, Req, ParseIntPipe, Patch } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.createFromCart(req.user!.id, createOrderDto);
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.ordersService.findAllForUser(req.user!.id);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOneForUser(req.user!.id, id);
  }
}