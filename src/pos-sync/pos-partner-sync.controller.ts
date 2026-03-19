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
import { ApiOkResponse } from '@nestjs/swagger';
import { PartnerCredentialsService } from '../partner-credentials/partner-credentials.service';
import { PartnerCredentialAuthGuard } from '../partner-credentials/partner-credential-auth.guard';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { IngestPosSyncDto } from './dto/ingest-pos-sync.dto';
import { PosSyncTransferConfirmationQueryDto } from './dto/pos-sync-transfer-confirmation-query.dto';
import { PosSyncTransferConfirmationResponseDto } from './dto/pos-sync-transfer-confirmation-response.dto';
import { ReplayPosSyncFailuresDto } from './dto/replay-pos-sync-failures.dto';
import { PosSyncService } from './pos-sync.service';

@Controller('pos/v1/sync/jobs')
export class PosPartnerSyncController {
  constructor(
    private readonly posSyncService: PosSyncService,
    private readonly partnerCredentialsService: PartnerCredentialsService,
  ) {}

  @Post('partner-ingest')
  @UseGuards(PartnerCredentialAuthGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  partnerIngest(@Body() dto: IngestPosSyncDto, @Req() req: any) {
    this.partnerCredentialsService.assertCredentialBranchAccess(
      req.partnerCredential,
      dto.branchId,
    );

    return this.posSyncService.ingest(
      {
        ...dto,
        partnerCredentialId:
          req.partnerCredential?.id ?? dto.partnerCredentialId,
      },
      {
        id: null,
        email: null,
        roles: [],
      },
    );
  }

  @Get(':id/transfer-confirmations')
  @UseGuards(PartnerCredentialAuthGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiOkResponse({
    type: PosSyncTransferConfirmationResponseDto,
    isArray: true,
  })
  partnerTransferConfirmations(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PosSyncTransferConfirmationQueryDto,
    @Req() req: any,
  ) {
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

  @Post(':id/replay-failures')
  @UseGuards(PartnerCredentialAuthGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  partnerReplayFailures(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplayPosSyncFailuresDto,
    @Req() req: any,
  ) {
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
}
