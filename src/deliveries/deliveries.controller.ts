import { 
  Controller, 
  Get, 
  Patch, 
  Body, 
  Param, 
  ParseIntPipe, 
  UseGuards, 
  Req 
} from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { DeliveryStatus } from './entities/delivery.entity';
import { UserRole } from '../auth/roles.enum';

@Controller('deliveries')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  // Deliverer: get their deliveries
  @Get('my')
  @Roles(UserRole.DELIVERER)
  getMyDeliveries(@Req() req: any) {
    return this.deliveriesService.getMyDeliveries(req.user.id);
  }

  // Deliverer: update status of a delivery
  @Patch(':id/status')
  @Roles(UserRole.DELIVERER)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: DeliveryStatus
  ) {
    return this.deliveriesService.updateStatus(id, status);
  }

  // Admin: get all deliveries
  @Get('all')
  @Roles(UserRole.ADMIN)
  getAllDeliveries() {
    return this.deliveriesService.getAllDeliveries();
  }

  // Admin: assign a delivery to a deliverer (endpoint, if needed)
  @Patch(':id/assign/:delivererId')
  @Roles(UserRole.ADMIN)
  assignDelivery(
    @Param('id', ParseIntPipe) id: number,
    @Param('delivererId', ParseIntPipe) delivererId: number
  ) {
    return this.deliveriesService.assignToOrder(id, delivererId);
  }
}