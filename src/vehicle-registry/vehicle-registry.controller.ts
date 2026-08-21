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
import { PosVehiclePermission } from './permissions/pos-vehicle-permission.enum';
import {
  CreatePlateSeriesDto,
  CreateVehicleClassDto,
  DraftRegistrationDto,
  ClearVehicleFlagDto,
  IssueRegistrationDto,
  ListPlateStockDto,
  RaiseVehicleFlagDto,
  RequestPlateNumberDto,
  ListVehicleClassesDto,
  SearchVehiclesDto,
  UpdateVehicleClassDto,
  VehicleBranchScopeDto,
} from './dto/vehicle-registry.dto';
import { VehicleRegistryService } from './vehicle-registry.service';

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

/**
 * The vehicle registry, under its own route namespace, as each format owns its
 * domain (see `pos/v1/school`).
 *
 * Every route names the permission it needs rather than sharing a broad one.
 * That is the point of splitting the codes finely: the read routes are open to
 * anyone who can issue OR inspect OR flag — a traffic officer must be able to
 * look a vehicle up — while each write route names exactly the one authority it
 * exercises, so a cashier's token cannot reach any of them.
 *
 * Class and plate-series writes are the registrar's alone (VEHICLE_PLATE_STOCK):
 * blanks are controlled stock, and a class defines what every office in the
 * region charges.
 */
@ApiTags('Vehicle Registry')
@Controller('pos/v1/vehicle-registry')
@UseGuards(...GUARDS)
@Roles(...ROLES)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class VehicleRegistryController {
  constructor(private readonly svc: VehicleRegistryService) {}

  // ── Classes ──────────────────────────────────────────────────────────────

  @Get('classes')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosVehiclePermission.VEHICLE_ISSUE,
    PosVehiclePermission.VEHICLE_RENEW,
    PosVehiclePermission.VEHICLE_INSPECT,
    PosVehiclePermission.VEHICLE_PLATE_STOCK,
  )
  listClasses(@Query() query: ListVehicleClassesDto) {
    return this.svc.listClasses(query);
  }

  @Post('classes')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosVehiclePermission.VEHICLE_PLATE_STOCK)
  createClass(@Body() dto: CreateVehicleClassDto) {
    return this.svc.createClass(dto);
  }

  @Patch('classes/:id')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosVehiclePermission.VEHICLE_PLATE_STOCK)
  updateClass(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehicleClassDto,
  ) {
    return this.svc.updateClass(id, dto);
  }

  // ── Plate stock ──────────────────────────────────────────────────────────

  @Get('plates')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosVehiclePermission.VEHICLE_PLATE_STOCK,
    PosVehiclePermission.VEHICLE_ISSUE,
  )
  listPlateStock(@Query() query: ListPlateStockDto) {
    return this.svc.listPlateStock(query);
  }

  @Post('plate-series')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosVehiclePermission.VEHICLE_PLATE_STOCK)
  createPlateSeries(@Body() dto: CreatePlateSeriesDto) {
    return this.svc.createPlateSeries(dto);
  }

  // ── Lookup ───────────────────────────────────────────────────────────────

  /**
   * Open to every registry lane including the checkpoint, because looking a
   * vehicle up is the one thing all of them do. VEHICLE_FLAG is listed so a
   * traffic officer — whose entire preset is that single code — can reach it.
   */
  @Get('search')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosVehiclePermission.VEHICLE_ISSUE,
    PosVehiclePermission.VEHICLE_RENEW,
    PosVehiclePermission.VEHICLE_TRANSFER,
    PosVehiclePermission.VEHICLE_INSPECT,
    PosVehiclePermission.VEHICLE_FLAG,
  )
  search(@Query() query: SearchVehiclesDto) {
    return this.svc.searchVehicles(query);
  }

  @Get('registrations/:id')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosVehiclePermission.VEHICLE_ISSUE,
    PosVehiclePermission.VEHICLE_RENEW,
    PosVehiclePermission.VEHICLE_TRANSFER,
    PosVehiclePermission.VEHICLE_INSPECT,
    PosVehiclePermission.VEHICLE_FLAG,
  )
  getRegistration(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.svc.getRegistration(id, branchId);
  }

  @Get('vehicles/:id/history')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosVehiclePermission.VEHICLE_ISSUE,
    PosVehiclePermission.VEHICLE_RENEW,
    PosVehiclePermission.VEHICLE_TRANSFER,
    PosVehiclePermission.VEHICLE_INSPECT,
    PosVehiclePermission.VEHICLE_FLAG,
  )
  getVehicleHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.svc.getVehicleHistory(id, branchId);
  }

  // ── Plate fitment ────────────────────────────────────────────────────────

  /**
   * Confirm the plate physically went on the car — a different act from issuing
   * it, performed by whoever watched it happen.
   */
  @Post('registrations/:id/plate-fitted')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosVehiclePermission.VEHICLE_ISSUE)
  confirmPlateFitted(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VehicleBranchScopeDto,
    @Req() req: any,
  ) {
    return this.svc.confirmPlateFitted(id, dto.branchId, req?.user?.id);
  }

  /** The worklist: registered vehicles still driving without their plate. */
  @Get('awaiting-plate')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosVehiclePermission.VEHICLE_ISSUE,
    PosVehiclePermission.VEHICLE_PLATE_STOCK,
  )
  awaitingPlate(@Query('branchId', ParseIntPipe) branchId: number) {
    return this.svc.listAwaitingPlateFitment(branchId);
  }

  /**
   * Record that the Bureau has applied to the Federal Trade Ministry for a
   * number.
   *
   * VEHICLE_PLATE_STOCK, not VEHICLE_ISSUE: applying to the federal ministry is
   * the registrar's act, not a counter clerk's. The clerk registers the
   * vehicle; obtaining the number is a level above them.
   */
  @Post('registrations/:id/request-plate-number')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosVehiclePermission.VEHICLE_PLATE_STOCK)
  requestPlateNumber(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestPlateNumberDto,
    @Req() req: any,
  ) {
    return this.svc.recordFederalPlateRequest(
      id,
      dto.branchId,
      dto.reference,
      req?.user?.id,
    );
  }

  /** Registered vehicles with no number yet — the Bureau's federal backlog. */
  @Get('awaiting-plate-number')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosVehiclePermission.VEHICLE_ISSUE,
    PosVehiclePermission.VEHICLE_PLATE_STOCK,
  )
  awaitingPlateNumber(@Query('branchId', ParseIntPipe) branchId: number) {
    return this.svc.listAwaitingPlateNumber(branchId);
  }

  /**
   * What the drive has registered and collected.
   *
   * Income is a stated purpose of this exercise, so the count and the money are
   * returned together — either alone answers half the question.
   */
  @Get('performance')
  @RetailBranchContext('query.branchId')
  @RequirePosPermissions(
    PosVehiclePermission.VEHICLE_PLATE_STOCK,
    PosVehiclePermission.VEHICLE_APPLICATION_REVIEW,
  )
  performance(
    @Query('branchId', ParseIntPipe) branchId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getRegistryPerformance(branchId, from, to);
  }

  // ── Flags ────────────────────────────────────────────────────────────────

  /**
   * Report a vehicle. VEHICLE_FLAG — the one permission a traffic officer's
   * lane carries, so a checkpoint can act without a supervisor present.
   */
  @Post('vehicles/:id/flags')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosVehiclePermission.VEHICLE_FLAG)
  raiseFlag(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RaiseVehicleFlagDto,
    @Req() req: any,
  ) {
    return this.svc.raiseFlag(
      {
        branchId: dto.branchId,
        vehicleId: id,
        type: dto.type,
        reference: dto.reference,
        note: dto.note,
      },
      req?.user?.id,
    );
  }

  /**
   * Release one. A DIFFERENT permission, deliberately: any officer may report a
   * vehicle, but a cleared flag is how a stolen car becomes sellable, so
   * releasing is a registrar's signature.
   */
  @Post('flags/:id/clear')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosVehiclePermission.VEHICLE_FLAG_CLEAR)
  clearFlag(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ClearVehicleFlagDto,
    @Req() req: any,
  ) {
    return this.svc.clearFlag(
      { branchId: dto.branchId, flagId: id, reason: dto.reason },
      req?.user?.id,
    );
  }

  // ── Registration ─────────────────────────────────────────────────────────

  /**
   * First half of payment-then-issue: take the details, reserve the plate,
   * issue nothing. Returns the fee lines for the till.
   */
  @Post('registrations/draft')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosVehiclePermission.VEHICLE_ISSUE)
  draft(@Body() dto: DraftRegistrationDto, @Req() req: any) {
    return this.svc.draftRegistration(dto, req?.user?.id);
  }

  /**
   * Second half: complete it against the settled checkout.
   *
   * VEHICLE_ISSUE, not a cashier's permission — the person who completes a
   * registration is the desk, even though the money was taken at another
   * window. The checkout id is the proof the fee was paid; the authority to
   * issue is separate from the authority to take payment.
   */
  @Post('registrations/:id/issue')
  @RetailBranchContext('body.branchId')
  @RequirePosPermissions(PosVehiclePermission.VEHICLE_ISSUE)
  issue(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueRegistrationDto,
    @Req() req: any,
  ) {
    return this.svc.issueRegistration(id, dto, req?.user?.id);
  }
}
