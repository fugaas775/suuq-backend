import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import {
  CreateKitchenStationDto,
  ListKitchenStationsQueryDto,
  ReorderKitchenStationsDto,
  UpdateKitchenStationDto,
} from './dto/kitchen-station.dto';
import { KitchenStationService } from './kitchen-station.service';

/**
 * The kitchen-station registry.
 *
 * **Reads are open to every POS role, writes are manager-and-up**, and neither
 * carries a `@RequirePosPermissions` — the same shape `kitchen/product-availability`
 * on the workflows controller already has. A new permission would have to land in
 * the backend enum, the manual-account allow-list and the frontend selector
 * before any of it could be granted, and there is no distinction a shop has
 * asked to draw here: whoever configures the menu configures where it is cooked.
 *
 * Every till READS this — it is what splits an order's slip into one ticket per
 * station — which is why it sits under `pos/v1` and takes `branchId` in the
 * query/body rather than living on the seller-workspace branch record, whose
 * PATCH is owner-only.
 */
@ApiTags('Kitchen Stations')
@Controller('pos/v1/kitchen')
@UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard, PosBranchAccessGuard)
@Roles(
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.POS_OPERATOR,
)
@RequireRetailModules(RetailOsModule.POS_CORE)
export class KitchenStationController {
  constructor(private readonly svc: KitchenStationService) {}

  @Get('stations')
  @RetailBranchContext('query.branchId')
  list(@Query() query: ListKitchenStationsQueryDto) {
    return this.svc.list(query);
  }

  @Post('stations')
  @RetailBranchContext('body.branchId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  create(@Body() dto: CreateKitchenStationDto) {
    return this.svc.create(dto);
  }

  @Patch('stations/reorder')
  @RetailBranchContext('body.branchId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  reorder(@Body() dto: ReorderKitchenStationsDto) {
    return this.svc.reorder(dto);
  }

  // Declared AFTER 'stations/reorder' so the literal route is matched first —
  // ':id' would otherwise swallow it and ParseIntPipe would 400 on "reorder".
  @Patch('stations/:id')
  @RetailBranchContext('body.branchId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKitchenStationDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete('stations/:id')
  @RetailBranchContext('query.branchId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.svc.remove(id, branchId);
  }
}
