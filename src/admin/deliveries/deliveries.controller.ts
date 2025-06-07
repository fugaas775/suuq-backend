import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AdminDeliveriesService } from './deliveries.service';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Delivery, DeliveryStatus } from '../../deliveries/entities/delivery.entity';
import { UserRole } from '../../auth/roles.enum';

@Controller('admin/deliveries')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDeliveriesController {
  constructor(private readonly deliveriesService: AdminDeliveriesService) {}

  @Get()
  getAllDeliveries() {
    return this.deliveriesService.getAll();
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: DeliveryStatus
  ) {
    return this.deliveriesService.updateStatus(id, status);
  }
}