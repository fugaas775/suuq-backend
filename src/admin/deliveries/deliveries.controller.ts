// src/admin/deliveries/admin-deliveries.controller.ts

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
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { Delivery, DeliveryStatus } from '../../deliveries/entities/delivery.entity';

@Controller('admin/deliveries')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
export class AdminDeliveriesController {
  constructor(private readonly deliveriesService: AdminDeliveriesService) {}

  @Get()
  getAllDeliveries() {
    return this.deliveriesService.getAll();
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: DeliveryStatus
  ) {
    return this.deliveriesService.updateStatus(id, status);
  }
}
