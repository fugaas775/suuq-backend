import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PartnerCredentialsService } from '../partner-credentials/partner-credentials.service';
import { PartnerPosSyncWriteGuard } from '../partner-credentials/partner-credential-scoped.guard';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { IngestPosSyncDto } from './dto/ingest-pos-sync.dto';
import { PosSyncJobListItemResponseDto } from './dto/pos-sync-job-response.dto';
import { PosSyncStatus, PosSyncType } from './entities/pos-sync-job.entity';
import { PosSyncService } from './pos-sync.service';

const PARTNER_SYNC_UNAUTHORIZED_RESPONSE = {
  description:
    'Partner credential is missing the required scope or is bound to another branch.',
  content: {
    'application/json': {
      examples: {
        missingScope: {
          summary: 'Missing sync scope',
          value: {
            statusCode: 401,
            message:
              'Partner credential is missing required POS scope: pos:sync:write',
            error: 'Unauthorized',
          },
        },
        wrongBranch: {
          summary: 'Branch mismatch',
          value: {
            statusCode: 401,
            message: 'Partner credential is not authorized for branch 4',
            error: 'Unauthorized',
          },
        },
      },
    },
  },
} as const;

@ApiTags('POS Partner Sync')
@Controller('pos/v1/sync/jobs')
export class PosPartnerSyncController {
  constructor(
    private readonly posSyncService: PosSyncService,
    private readonly partnerCredentialsService: PartnerCredentialsService,
  ) {}

  @Post('partner-ingest')
  @UseGuards(PartnerPosSyncWriteGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiBody({
    type: IngestPosSyncDto,
    examples: {
      salesSummarySync: {
        summary: 'Ingest a partner sync job',
        value: {
          branchId: 3,
          syncType: 'SALES_SUMMARY',
          externalJobId: 'sync-1001',
          idempotencyKey: 'sync-job-1001',
          entries: [
            {
              productId: 55,
              quantity: 2,
              note: 'Partner terminal summary',
            },
          ],
        },
      },
    },
  })
  @ApiUnauthorizedResponse(PARTNER_SYNC_UNAUTHORIZED_RESPONSE)
  @ApiCreatedResponse({
    type: PosSyncJobListItemResponseDto,
    content: {
      'application/json': {
        examples: {
          syncJobAccepted: {
            summary: 'Partner sync job accepted',
            value: {
              id: 201,
              branchId: 3,
              partnerCredentialId: 9,
              syncType: PosSyncType.SALES_SUMMARY,
              status: PosSyncStatus.PROCESSED,
              externalJobId: 'sync-1001',
              idempotencyKey: 'sync-job-1001',
              acceptedCount: 1,
              rejectedCount: 0,
              processedAt: '2026-04-01T12:00:05.000Z',
              failedEntries: [],
              createdAt: '2026-04-01T12:00:00.000Z',
              updatedAt: '2026-04-01T12:00:05.000Z',
            },
          },
        },
      },
    },
  })
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
}
