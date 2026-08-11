import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { ActionPathNormalizationInterceptor } from '../common/interceptors/action-path-normalization.interceptor';
import { RetailBranchContext } from './decorators/retail-branch-context.decorator';
import { RequireRetailModules } from './decorators/require-retail-modules.decorator';
import { RetailModule as RetailOsModule } from './entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from './retail-modules.guard';
import { RetailInventoryOpsService } from './retail-inventory-ops.service';
import {
  RetailStockAdjustmentDto,
  RetailStockAdjustmentHistoryResponseDto,
  RetailStockAdjustmentResponseDto,
  RetailStockAdjustmentsQueryDto,
} from './dto/retail-stock-adjustment.dto';
import {
  RetailStockCountDto,
  RetailStockCountResponseDto,
  RetailStockCountsHistoryResponseDto,
  RetailStockCountsQueryDto,
} from './dto/retail-stock-count.dto';
import {
  RetailParLevelsQueryDto,
  RetailParLevelsResponseDto,
  RetailUpdateParLevelsDto,
  RetailUpdateParLevelsResponseDto,
} from './dto/retail-par-levels.dto';

const INVENTORY_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
  UserRole.B2B_BUYER,
] as const;

@ApiTags('Retail Inventory Ops')
@Controller('retail/v1/ops')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(new ActionPathNormalizationInterceptor())
export class RetailInventoryOpsController {
  constructor(
    private readonly inventoryOpsService: RetailInventoryOpsService,
  ) {}

  // ── Stock adjustments ───────────────────────────────────────────────────────

  @Post('stock-adjustments')
  @UseGuards(RetailModulesGuard)
  @Roles(...INVENTORY_ROLES)
  @RequireRetailModules(RetailOsModule.INVENTORY_CORE)
  @RetailBranchContext('body.branchId')
  @ApiOperation({
    summary:
      'Record a manual stock adjustment (waste / shrinkage / found stock) and log it to the movement ledger',
  })
  @ApiBody({ type: RetailStockAdjustmentDto })
  @ApiOkResponse({ type: RetailStockAdjustmentResponseDto })
  adjustStock(@Body() body: RetailStockAdjustmentDto, @Req() req) {
    return this.inventoryOpsService.adjustStock(
      body.branchId,
      body,
      req.user?.id ?? null,
    );
  }

  @Get('stock-adjustments')
  @UseGuards(RetailModulesGuard)
  @Roles(...INVENTORY_ROLES)
  @RequireRetailModules(RetailOsModule.INVENTORY_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary: 'List recent manual stock adjustments for a branch',
  })
  @ApiOkResponse({ type: RetailStockAdjustmentHistoryResponseDto })
  getStockAdjustments(@Query() query: RetailStockAdjustmentsQueryDto) {
    return this.inventoryOpsService.getStockAdjustments(query);
  }

  // ── Physical / cycle counts ─────────────────────────────────────────────────

  @Post('stock-counts')
  @UseGuards(RetailModulesGuard)
  @Roles(...INVENTORY_ROLES)
  @RequireRetailModules(RetailOsModule.INVENTORY_CORE)
  @RetailBranchContext('body.branchId')
  @ApiOperation({
    summary:
      'Submit a physical / cycle count: reset each line to the counted quantity and log the variance',
  })
  @ApiBody({ type: RetailStockCountDto })
  @ApiOkResponse({ type: RetailStockCountResponseDto })
  countStock(@Body() body: RetailStockCountDto, @Req() req) {
    return this.inventoryOpsService.countStock(
      body.branchId,
      body,
      req.user?.id ?? null,
    );
  }

  @Get('stock-counts')
  @UseGuards(RetailModulesGuard)
  @Roles(...INVENTORY_ROLES)
  @RequireRetailModules(RetailOsModule.INVENTORY_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({ summary: 'List recent stock counts for a branch' })
  @ApiOkResponse({ type: RetailStockCountsHistoryResponseDto })
  getStockCounts(@Query() query: RetailStockCountsQueryDto) {
    return this.inventoryOpsService.getStockCounts(query);
  }

  // ── Par levels & reorder points ─────────────────────────────────────────────

  @Get('par-levels')
  @UseGuards(RetailModulesGuard)
  @Roles(...INVENTORY_ROLES)
  @RequireRetailModules(RetailOsModule.INVENTORY_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOperation({
    summary: 'Get per-SKU par levels and reorder points for a branch',
  })
  @ApiOkResponse({ type: RetailParLevelsResponseDto })
  getParLevels(@Query() query: RetailParLevelsQueryDto) {
    return this.inventoryOpsService.getParLevels(query);
  }

  @Patch('par-levels')
  @UseGuards(RetailModulesGuard)
  @Roles(...INVENTORY_ROLES)
  @RequireRetailModules(RetailOsModule.INVENTORY_CORE)
  @RetailBranchContext('body.branchId')
  @ApiOperation({
    summary: 'Batch-upsert per-SKU par levels and reorder points',
  })
  @ApiBody({ type: RetailUpdateParLevelsDto })
  @ApiOkResponse({ type: RetailUpdateParLevelsResponseDto })
  updateParLevels(@Body() body: RetailUpdateParLevelsDto) {
    return this.inventoryOpsService.updateParLevels(body.branchId, body);
  }
}
