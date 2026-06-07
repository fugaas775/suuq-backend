import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RequirePosPermissions } from '../auth/decorators/require-pos-permissions.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { PosPropertyRentalPermission } from './permissions/pos-property-rental-permission.enum';
import {
  CreatePropertyRatePlanDto,
  CreatePropertyReservationDto,
  CreatePropertyUnitDto,
  ListPropertyRatePlansQueryDto,
  ListPropertyReservationsQueryDto,
  ListPropertyUnitsQueryDto,
  UpdatePropertyReservationDto,
  UpdatePropertyUnitDto,
} from './dto/property-inventory.dto';
import { PropertyRentalInventoryService } from './property-rental-inventory.service';

const GUARDS = [
  JwtAuthGuard,
  RolesGuard,
  RetailModulesGuard,
  PosBranchAccessGuard,
];
const ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
];

@ApiTags('Property Rental Inventory')
@Controller('pos/v1/property-rental')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class PropertyRentalInventoryController {
  constructor(private readonly svc: PropertyRentalInventoryService) {}

  // ── Properties (units) ────────────────────────────────────────────────────

  @Get('properties')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.VIEW_PROPERTY_BOARD)
  listProperties(@Query() query: ListPropertyUnitsQueryDto) {
    return this.svc.listUnits(query);
  }

  @Post('properties')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.OPEN_PROPERTY_BOOKING)
  createProperty(@Body() dto: CreatePropertyUnitDto) {
    return this.svc.createUnit(dto);
  }

  @Patch('properties/:id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.OPEN_PROPERTY_BOOKING)
  updateProperty(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePropertyUnitDto,
  ) {
    return this.svc.updateUnit(id, dto);
  }

  // ── Rate plans ────────────────────────────────────────────────────────────

  @Get('rate-plans')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.VIEW_PROPERTY_BOARD)
  listRatePlans(@Query() query: ListPropertyRatePlansQueryDto) {
    return this.svc.listRatePlans(query);
  }

  @Post('rate-plans')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.OPEN_PROPERTY_BOOKING)
  createRatePlan(@Body() dto: CreatePropertyRatePlanDto) {
    return this.svc.createRatePlan(dto);
  }

  // ── Reservations ──────────────────────────────────────────────────────────

  @Get('reservations')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.VIEW_PROPERTY_BOARD)
  listReservations(@Query() query: ListPropertyReservationsQueryDto) {
    return this.svc.listReservations(query);
  }

  @Post('reservations')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.OPEN_PROPERTY_BOOKING)
  createReservation(@Body() dto: CreatePropertyReservationDto, @Req() req) {
    return this.svc.createReservation(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }

  @Patch('reservations/:id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.OPEN_PROPERTY_BOOKING)
  updateReservation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePropertyReservationDto,
  ) {
    return this.svc.updateReservation(id, dto);
  }
}
