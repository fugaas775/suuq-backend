import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
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

  private buildDeliveryListOptions(query: {
    attention?: string;
    latitude?: string;
    longitude?: string;
    withinKm?: string;
  }) {
    const parseOptionalNumber = (raw?: string) => {
      if (raw === undefined || raw === null || String(raw).trim() === '') {
        return undefined;
      }

      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw new BadRequestException(`Invalid numeric query value: ${raw}`);
      }

      return parsed;
    };

    const latitude = parseOptionalNumber(query.latitude);
    const longitude = parseOptionalNumber(query.longitude);
    const withinKm = parseOptionalNumber(query.withinKm);

    if (
      (latitude !== undefined && longitude === undefined) ||
      (latitude === undefined && longitude !== undefined)
    ) {
      throw new BadRequestException(
        'latitude and longitude must be provided together',
      );
    }

    if (withinKm !== undefined && withinKm <= 0) {
      throw new BadRequestException('withinKm must be greater than 0');
    }

    return {
      attention: query.attention,
      latitude,
      longitude,
      withinKm,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/assignments')
  async getMyAssignments(
    @Req() req: any,
    @Query('attention') attention?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('withinKm') withinKm?: string,
  ) {
    return this.delivererService.getMyAssignments(
      req.user.id,
      this.buildDeliveryListOptions({
        attention,
        latitude,
        longitude,
        withinKm,
      }),
    );
  }

  // Alias for frontend: /deliverer/my-assignments
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/my-assignments')
  async getMyAssignmentsAlias(
    @Req() req: any,
    @Query('attention') attention?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('withinKm') withinKm?: string,
  ) {
    return this.delivererService.getMyAssignments(
      req.user.id,
      this.buildDeliveryListOptions({
        attention,
        latitude,
        longitude,
        withinKm,
      }),
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/my-deliveries')
  async getMyDeliveries(
    @Req() req: any,
    @Query('attention') attention?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('withinKm') withinKm?: string,
  ) {
    return this.delivererService.getMyAssignments(
      req.user.id,
      this.buildDeliveryListOptions({
        attention,
        latitude,
        longitude,
        withinKm,
      }),
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/assigned-orders')
  async getAssignedOrders(
    @Req() req: any,
    @Query('attention') attention?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('withinKm') withinKm?: string,
  ) {
    return this.delivererService.getMyAssignments(
      req.user.id,
      this.buildDeliveryListOptions({
        attention,
        latitude,
        longitude,
        withinKm,
      }),
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/needs-attention')
  async getNeedsAttention(
    @Req() req: any,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('withinKm') withinKm?: string,
  ) {
    const options = this.buildDeliveryListOptions({
      latitude,
      longitude,
      withinKm,
    });

    return this.delivererService.getMyAssignments(req.user.id, {
      attention: 'needs_attention',
      latitude: options.latitude,
      longitude: options.longitude,
      withinKm: options.withinKm,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/available-orders')
  async getAvailableOrdersPool(
    @Req() req: any,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('withinKm') withinKm?: string,
  ) {
    return this.delivererService.getAvailableOrders(
      this.buildDeliveryListOptions({ latitude, longitude, withinKm }),
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/open-orders')
  async getOpenOrdersPool(
    @Req() req: any,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('withinKm') withinKm?: string,
  ) {
    return this.delivererService.getAvailableOrders(
      this.buildDeliveryListOptions({ latitude, longitude, withinKm }),
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/pending-orders')
  async getPendingOrdersPool(
    @Req() req: any,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('withinKm') withinKm?: string,
  ) {
    return this.delivererService.getAvailableOrders(
      this.buildDeliveryListOptions({ latitude, longitude, withinKm }),
    );
  }

  // Detail with vendor summary
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Get('deliverer/orders/:orderId')
  async getAssignmentDetail(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('withinKm') withinKm?: string,
  ) {
    return this.delivererService.getMyAssignmentDetail(
      req.user.id,
      orderId,
      this.buildDeliveryListOptions({ latitude, longitude, withinKm }),
    );
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
  @Patch('deliverer/orders/:orderId/proof')
  async attachProofOfDelivery(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body('proofOfDeliveryUrl') proofOfDeliveryUrl: string,
  ) {
    if (!proofOfDeliveryUrl) {
      throw new BadRequestException('proofOfDeliveryUrl is required');
    }
    return this.delivererService.attachProofOfDelivery(
      req.user.id,
      orderId,
      proofOfDeliveryUrl,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Patch('deliverer/orders/:orderId/fail')
  async failDelivery(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body('reasonCode') reasonCode: string,
    @Body('proofOfDeliveryUrl') proofOfDeliveryUrl: string,
    @Body('notes') notes?: string,
  ) {
    if (!reasonCode) {
      throw new BadRequestException('reasonCode is required');
    }
    if (!proofOfDeliveryUrl) {
      throw new BadRequestException('proofOfDeliveryUrl is required');
    }
    return this.delivererService.failDelivery(
      req.user.id,
      orderId,
      reasonCode,
      proofOfDeliveryUrl,
      notes,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DELIVERER)
  @Patch('deliverer/orders/:orderId/status')
  async updateDeliveryStatus(
    @Req() req: any,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body('status') status: OrderStatus,
  ) {
    // If you want to enforce delivery code, keep the check or modify.
    // For now, removing the Throw per user request to enable easier testing/flow.
    /*
    if (status === OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'You must use the verification code to complete delivery.',
      );
    }
    */
    return this.delivererService.updateDeliveryStatus(
      req.user.id,
      orderId,
      status,
    );
  }
}
