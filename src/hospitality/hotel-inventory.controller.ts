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
import { PosHospitalityPermission } from './permissions/pos-hospitality-permission.enum';
import {
  CreateHotelRatePlanDto,
  CreateHotelReservationDto,
  CreateHotelRoomDto,
  ListHotelRatePlansQueryDto,
  ListHotelReservationsQueryDto,
  ListHotelRoomsQueryDto,
  ListNightAuditLogsQueryDto,
  TriggerNightAuditDto,
  UpdateHotelReservationDto,
  UpdateHotelRoomDto,
} from './dto/hotel-rooms-reservations.dto';
import { HotelInventoryService } from './hotel-inventory.service';

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

@ApiTags('Hotel Inventory')
@Controller('pos/v1/hotel')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class HotelInventoryController {
  constructor(private readonly svc: HotelInventoryService) {}

  // ── Rooms ───────────────────────────────────────────────────────────────

  @Get('rooms')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosHospitalityPermission.VIEW_FOLIO_BOARD)
  listRooms(@Query() query: ListHotelRoomsQueryDto) {
    return this.svc.listRooms(query);
  }

  @Post('rooms')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosHospitalityPermission.OPEN_ROOM_FOLIO)
  createRoom(@Body() dto: CreateHotelRoomDto) {
    return this.svc.createRoom(dto);
  }

  @Patch('rooms/:id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosHospitalityPermission.OPEN_ROOM_FOLIO)
  updateRoom(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHotelRoomDto,
  ) {
    return this.svc.updateRoom(id, dto);
  }

  // ── Rate plans ──────────────────────────────────────────────────────────

  @Get('rate-plans')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosHospitalityPermission.VIEW_FOLIO_BOARD)
  listRatePlans(@Query() query: ListHotelRatePlansQueryDto) {
    return this.svc.listRatePlans(query);
  }

  @Post('rate-plans')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosHospitalityPermission.OPEN_ROOM_FOLIO)
  createRatePlan(@Body() dto: CreateHotelRatePlanDto) {
    return this.svc.createRatePlan(dto);
  }

  // ── Reservations ────────────────────────────────────────────────────────

  @Get('reservations')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosHospitalityPermission.VIEW_FOLIO_BOARD)
  listReservations(@Query() query: ListHotelReservationsQueryDto) {
    return this.svc.listReservations(query);
  }

  @Post('reservations')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosHospitalityPermission.OPEN_ROOM_FOLIO)
  createReservation(@Body() dto: CreateHotelReservationDto, @Req() req) {
    return this.svc.createReservation(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }

  @Patch('reservations/:id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosHospitalityPermission.OPEN_ROOM_FOLIO)
  updateReservation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHotelReservationDto,
  ) {
    return this.svc.updateReservation(id, dto);
  }

  // ── Night audit ─────────────────────────────────────────────────────────

  @Post('night-audit')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosHospitalityPermission.RUN_NIGHT_AUDIT)
  runNightAudit(@Body() dto: TriggerNightAuditDto, @Req() req) {
    return this.svc.runNightAudit(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }

  @Get('night-audit/logs')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosHospitalityPermission.VIEW_HOTEL_REPORT)
  listNightAuditLogs(@Query() query: ListNightAuditLogsQueryDto) {
    return this.svc.listNightAuditLogs(query);
  }
}
