import { Controller, Get, Patch, Body, Param, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DeliveryStatus } from './entities/delivery.entity';
import { UserRole } from '../constants/roles'; // Import the centralized role enum

@Controller('deliveries')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get('my')
  @Roles(UserRole.DELIVERER)
  getMyDeliveries(@Req() req: any) {
    return this.deliveriesService.getMyDeliveries(req.user.id);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DELIVERER)
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: DeliveryStatus) {
    return this.deliveriesService.updateStatus(id, status);
  }
 
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('all')
  getAllDeliveries() {
    return this.deliveriesService.getAllDeliveries();
  }
}
