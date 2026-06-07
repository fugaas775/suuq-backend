import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { ParkedOrdersService } from './parked-orders.service';
import {
  CreateParkedOrderDto,
  UpdateParkedOrderStatusDto,
} from './dto/parked-order.dto';

/**
 * Consumer-facing: a shopper parks an order from any product surface
 * (product details, immersive feed, chat, or product request).
 * Auth is optional so guests can still park; when present we attach the user.
 */
@Controller('consumer/v1/parked-orders')
export class ConsumerParkedOrdersController {
  constructor(private readonly service: ParkedOrdersService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  park(@Body() dto: CreateParkedOrderDto, @Req() req: AuthenticatedRequest) {
    return this.service.create(dto, req.user?.id ?? null);
  }
}

/** Vendor-facing: list & manage the parked orders for the signed-in vendor. */
@Controller('vendor/parked-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorParkedOrdersController {
  constructor(private readonly service: ParkedOrdersService) {}

  @Get()
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  list(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listForVendor(req.user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }

  @Patch(':id/status')
  @Roles(UserRole.VENDOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateParkedOrderStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.updateStatus(id, req.user.id, dto.status);
  }
}

/** POS portal: branch operators see parked orders for their branch. */
@Controller('pos/v1/parked-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PosParkedOrdersController {
  constructor(private readonly service: ParkedOrdersService) {}

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.POS_OPERATOR,
  )
  list(
    @Req() req: AuthenticatedRequest,
    @Query('branchId', ParseIntPipe) branchId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    // Scope branch-bound tokens to their own branch.
    const claimBranchId = Number(
      (req.user as unknown as { branchId?: number })?.branchId || 0,
    );
    if (claimBranchId && claimBranchId !== branchId) {
      throw new ForbiddenException('Branch scope mismatch');
    }
    return this.service.listForBranch(branchId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }
}
