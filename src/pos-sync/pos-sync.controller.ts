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
import { ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { CreatePosSyncJobDto } from './dto/create-pos-sync-job.dto';
import { IngestPosSyncDto } from './dto/ingest-pos-sync.dto';
import { PosSyncTransferConfirmationQueryDto } from './dto/pos-sync-transfer-confirmation-query.dto';
import { PosSyncTransferConfirmationResponseDto } from './dto/pos-sync-transfer-confirmation-response.dto';
import { ReplayPosSyncFailuresDto } from './dto/replay-pos-sync-failures.dto';
import { UpdatePosSyncJobStatusDto } from './dto/update-pos-sync-job-status.dto';
import { PosSyncService } from './pos-sync.service';

@Controller('pos/v1/sync/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PosSyncController {
  constructor(private readonly posSyncService: PosSyncService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  findAll() {
    return this.posSyncService.findAll();
  }

  @Get(':id/transfer-confirmations')
  @UseGuards(RetailModulesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOkResponse({
    type: PosSyncTransferConfirmationResponseDto,
    isArray: true,
  })
  transferConfirmations(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PosSyncTransferConfirmationQueryDto,
  ) {
    return this.posSyncService.listTransferConfirmations(id, query.branchId);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  create(@Body() dto: CreatePosSyncJobDto) {
    return this.posSyncService.create(dto);
  }

  @Post('ingest')
  @UseGuards(RetailModulesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  ingest(@Body() dto: IngestPosSyncDto, @Req() req) {
    return this.posSyncService.ingest(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Patch(':id/status')
  @UseGuards(RetailModulesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePosSyncJobStatusDto,
  ) {
    return this.posSyncService.updateStatus(id, dto);
  }

  @Post(':id/replay-failures')
  @UseGuards(RetailModulesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  replayFailures(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplayPosSyncFailuresDto,
    @Req() req,
  ) {
    return this.posSyncService.replayFailedEntries(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }
}
