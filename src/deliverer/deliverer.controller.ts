import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { DelivererService } from './deliverer.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { OrderStatus } from '../orders/entities/order.entity';

@Controller()
export class DelivererController {
  constructor(private readonly delivererService: DelivererService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/assignments')
  async getMyAssignments(@Req() req: any) {
    return this.delivererService.getMyAssignments(req.user.id);
  }

  // Alias for frontend: /deliverer/my-assignments
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/my-assignments')
  async getMyAssignmentsAlias(@Req() req: any) {
    return this.delivererService.getMyAssignments(req.user.id);
  }

  // Detail with vendor summary
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/orders/:orderId')
  async getAssignmentDetail(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.delivererService.getMyAssignmentDetail(req.user.id, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Patch('deliverer/orders/:orderId/accept')
  async acceptAssignment(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.delivererService.acceptAssignment(req.user.id, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Patch('deliverer/orders/:orderId/reject')
  async rejectAssignment(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.delivererService.rejectAssignment(req.user.id, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Patch('deliverer/orders/:orderId/pickup')
  async confirmPickup(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.delivererService.confirmPickup(req.user.id, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Patch('deliverer/orders/:orderId/verify')
  async verifyDelivery(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body('code') code: string,
  ) {
    if (!code) throw new BadRequestException('Code is required');
    return this.delivererService.verifyDelivery(req.user.id, orderId, code);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Patch('deliverer/orders/:orderId/status')
  async updateDeliveryStatus(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body('status') status: OrderStatus,
  ) {
    if (status === OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'You must use the verification code to complete delivery.',
      );
    }
    return this.delivererService.updateDeliveryStatus(
      req.user.id,
      orderId,
      status,
    );
  }
}
