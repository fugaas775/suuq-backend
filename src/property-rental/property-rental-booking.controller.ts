import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
  ListPropertyBookingsQueryDto,
  OpenPropertyBookingDto,
  PostPropertyChargeDto,
  SettlePropertyBookingDto,
  TransferPropertyUnitDto,
  VoidPropertyBookingDto,
} from './dto/property-rental-booking.dto';
import { PropertyRentalBookingService } from './property-rental-booking.service';

@ApiTags('Property Rental Booking')
@Controller('pos/v1/property-rental/bookings')
@UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class PropertyRentalBookingController {
  constructor(private readonly bookingService: PropertyRentalBookingService) {}

  @Get()
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.VIEW_PROPERTY_BOARD)
  listBookings(@Query() query: ListPropertyBookingsQueryDto) {
    return this.bookingService.listBookings(query);
  }

  @Get(':bookingId')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.VIEW_PROPERTY_BOARD)
  getBooking(@Param('bookingId', ParseIntPipe) bookingId: number) {
    return this.bookingService.getBooking(bookingId);
  }

  @Post()
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.OPEN_PROPERTY_BOOKING)
  openBooking(@Body() dto: OpenPropertyBookingDto, @Req() req) {
    return this.bookingService.openBooking(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }

  @Post(':bookingId/charges')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.POST_PROPERTY_CHARGE)
  postCharge(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: PostPropertyChargeDto,
  ) {
    return this.bookingService.postCharge(bookingId, dto);
  }

  @Post(':bookingId/settle')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.SETTLE_PROPERTY_BOOKING)
  settleBooking(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: SettlePropertyBookingDto,
  ) {
    return this.bookingService.settleBooking(bookingId, dto);
  }

  @Post(':bookingId/void')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.VOID_PROPERTY_BOOKING)
  voidBooking(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: VoidPropertyBookingDto,
  ) {
    return this.bookingService.voidBooking(bookingId, dto);
  }

  @Post(':bookingId/transfer')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosPropertyRentalPermission.TRANSFER_PROPERTY_UNIT)
  transferUnit(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: TransferPropertyUnitDto,
  ) {
    return this.bookingService.transferUnit(bookingId, dto);
  }
}
