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
import { ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { PartnerCredentialsService } from '../partner-credentials/partner-credentials.service';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { CreatePosSyncJobDto } from './dto/create-pos-sync-job.dto';
import { IngestPosSyncDto } from './dto/ingest-pos-sync.dto';
import { ListPosSyncJobsQueryDto } from './dto/list-pos-sync-jobs-query.dto';
import { PosSyncJobPageResponseDto } from './dto/pos-sync-job-response.dto';
import { PosSyncTransferConfirmationQueryDto } from './dto/pos-sync-transfer-confirmation-query.dto';
import { PosSyncTransferConfirmationResponseDto } from './dto/pos-sync-transfer-confirmation-response.dto';
import { ReplayPosSyncFailuresDto } from './dto/replay-pos-sync-failures.dto';
import { UpdatePosSyncJobStatusDto } from './dto/update-pos-sync-job-status.dto';
import { PosSyncRequestAuthGuard } from './pos-sync-request-auth.guard';
import { PosSyncService } from './pos-sync.service';

const POS_SYNC_OPERATOR_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.POS_MANAGER,
];

@Controller('pos/v1/sync/jobs')
export class PosSyncController {
  constructor(
    private readonly posSyncService: PosSyncService,
    private readonly partnerCredentialsService: PartnerCredentialsService,
  ) {}

  private assertPosSyncOperator(req: any) {
    const userRoles = Array.isArray(req?.user?.roles) ? req.user.roles : [];
    const hasRequiredRole = POS_SYNC_OPERATOR_ROLES.some((role) =>
      userRoles.includes(role),
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException('Insufficient role for POS sync operation');
    }
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOkResponse({ type: PosSyncJobPageResponseDto })
  findAll(@Query() query: ListPosSyncJobsQueryDto) {
    return this.posSyncService.findAll(query);
  }

  @Get(':id/transfer-confirmations')
  @UseGuards(PosSyncRequestAuthGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOkResponse({
    type: PosSyncTransferConfirmationResponseDto,
    isArray: true,
  })
  transferConfirmations(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PosSyncTransferConfirmationQueryDto,
    @Req() req: any,
  ) {
    if (req.partnerCredential) {
      this.partnerCredentialsService.assertCredentialBranchAccess(
        req.partnerCredential,
        query.branchId,
      );

      return this.posSyncService.listTransferConfirmations(
        id,
        query.branchId,
        req.partnerCredential?.id ?? null,
      );
    }

    this.assertPosSyncOperator(req);

    return this.posSyncService.listTransferConfirmations(id, query.branchId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  create(@Body() dto: CreatePosSyncJobDto) {
    return this.posSyncService.create(dto);
  }

  @Post('ingest')
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard, RetailModulesGuard)
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
  @UseGuards(PosSyncRequestAuthGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  replayFailures(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplayPosSyncFailuresDto,
    @Req() req: any,
  ) {
    if (req.partnerCredential) {
      this.partnerCredentialsService.assertCredentialBranchAccess(
        req.partnerCredential,
        dto.branchId,
      );

      return this.posSyncService.replayFailedEntries(
        id,
        dto,
        {
          id: null,
          email: null,
          roles: [],
        },
        req.partnerCredential?.id ?? null,
      );
    }

    this.assertPosSyncOperator(req);

    return this.posSyncService.replayFailedEntries(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }
}
