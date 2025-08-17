import { Controller, Get, Patch, Body, Param, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Patch('deliverer/orders/:orderId/status')
  async updateDeliveryStatus(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body('status') status: OrderStatus,
  ) {
    return this.delivererService.updateDeliveryStatus(req.user.id, orderId, status);
  }
}
