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
import { PosHospitalityPermission } from './permissions/pos-hospitality-permission.enum';
import {
  ListHotelFoliosQueryDto,
  OpenFolioDto,
  PostFolioChargeDto,
  SettleFolioDto,
  TransferFolioRoomDto,
  VoidFolioDto,
} from './dto/hotel-folio.dto';
import { HotelFolioService } from './hotel-folio.service';

@ApiTags('Hotel Folio')
@Controller('pos/v1/hotel/folios')
@UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class HotelFolioController {
  constructor(private readonly hotelFolioService: HotelFolioService) {}

  @Get()
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(PosHospitalityPermission.VIEW_FOLIO_BOARD)
  listFolios(@Query() query: ListHotelFoliosQueryDto) {
    return this.hotelFolioService.listFolios(query);
  }

  @Post()
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosHospitalityPermission.OPEN_ROOM_FOLIO)
  openFolio(@Body() dto: OpenFolioDto, @Req() req) {
    return this.hotelFolioService.openFolio(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }

  @Post(':folioId/charges')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosHospitalityPermission.POST_FOLIO_CHARGE)
  postCharge(
    @Param('folioId', ParseIntPipe) folioId: number,
    @Body() dto: PostFolioChargeDto,
  ) {
    return this.hotelFolioService.postCharge(folioId, dto);
  }

  @Post(':folioId/settle')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(
    PosHospitalityPermission.SETTLE_ROOM_FOLIO,
    PosHospitalityPermission.SETTLE_TABLE_FOLIO,
  )
  settleFolio(
    @Param('folioId', ParseIntPipe) folioId: number,
    @Body() dto: SettleFolioDto,
  ) {
    return this.hotelFolioService.settleFolio(folioId, dto);
  }

  @Post(':folioId/void')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosHospitalityPermission.VOID_ROOM_FOLIO)
  voidFolio(
    @Param('folioId', ParseIntPipe) folioId: number,
    @Body() dto: VoidFolioDto,
  ) {
    return this.hotelFolioService.voidFolio(folioId, dto);
  }

  @Post(':folioId/transfer')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosHospitalityPermission.TRANSFER_FOLIO_ROOM)
  transferFolioRoom(
    @Param('folioId', ParseIntPipe) folioId: number,
    @Body() dto: TransferFolioRoomDto,
  ) {
    return this.hotelFolioService.transferFolioRoom(folioId, dto);
  }
}
