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
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PartnerCredentialsService } from '../partner-credentials/partner-credentials.service';
import {
  PartnerPosCheckoutReadGuard,
  PartnerPosCheckoutWriteGuard,
} from '../partner-credentials/partner-credential-scoped.guard';
import { RetailBranchContext } from '../retail/decorators/retail-branch-context.decorator';
import { RequireRetailModules } from '../retail/decorators/require-retail-modules.decorator';
import { RetailModule as RetailOsModule } from '../retail/entities/tenant-module-entitlement.entity';
import { RetailModulesGuard } from '../retail/retail-modules.guard';
import { IngestPosCheckoutDto } from './dto/ingest-pos-checkout.dto';
import { ListPosCheckoutsQueryDto } from './dto/list-pos-checkouts-query.dto';
import {
  PosCheckoutPageResponseDto,
  PosCheckoutResponseDto,
} from './dto/pos-checkout-response.dto';
import {
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from './entities/pos-checkout.entity';
import { PosCheckoutService } from './pos-checkout.service';

const PARTNER_CHECKOUT_UNAUTHORIZED_RESPONSE = {
  description:
    'Partner credential is missing the required scope or is bound to another branch.',
  content: {
    'application/json': {
      examples: {
        missingScope: {
          summary: 'Missing checkout scope',
          value: {
            statusCode: 401,
            message:
              'Partner credential is missing required POS scope: pos:checkout:write',
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

@ApiTags('POS Partner Checkouts')
@Controller('pos/v1/checkouts')
export class PosPartnerCheckoutController {
  constructor(
    private readonly posCheckoutService: PosCheckoutService,
    private readonly partnerCredentialsService: PartnerCredentialsService,
  ) {}

  @Get('partner-history')
  @UseGuards(PartnerPosCheckoutReadGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiUnauthorizedResponse(PARTNER_CHECKOUT_UNAUTHORIZED_RESPONSE)
  @ApiOkResponse({
    type: PosCheckoutPageResponseDto,
    content: {
      'application/json': {
        examples: {
          partnerHistoryPage: {
            summary: 'Partner checkout history page',
            value: {
              items: [
                {
                  id: 71,
                  branchId: 3,
                  partnerCredentialId: 9,
                  externalCheckoutId: 'sale-1001',
                  idempotencyKey: 'checkout-1001',
                  registerId: 'front-1',
                  registerSessionId: 11,
                  suspendedCartId: null,
                  receiptNumber: 'R-1001',
                  transactionType: PosCheckoutTransactionType.SALE,
                  status: PosCheckoutStatus.PROCESSED,
                  currency: 'USD',
                  subtotal: 15,
                  discountAmount: 0,
                  taxAmount: 0,
                  total: 15,
                  paidAmount: 20,
                  changeDue: 5,
                  itemCount: 1,
                  occurredAt: '2026-04-01T10:00:00.000Z',
                  processedAt: '2026-04-01T10:00:05.000Z',
                  cashierUserId: null,
                  cashierName: 'Lane 1 POS',
                  note: null,
                  failureReason: null,
                  createdAt: '2026-04-01T10:00:01.000Z',
                  updatedAt: '2026-04-01T10:00:05.000Z',
                },
              ],
              total: 1,
              page: 1,
              perPage: 20,
              totalPages: 1,
            },
          },
        },
      },
    },
  })
  findAll(@Query() query: ListPosCheckoutsQueryDto, @Req() req: any) {
    this.partnerCredentialsService.assertCredentialBranchAccess(
      req.partnerCredential,
      query.branchId,
    );

    return this.posCheckoutService.findAll(query);
  }

  @Get('partner-history/:id')
  @UseGuards(PartnerPosCheckoutReadGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('query.branchId')
  @ApiUnauthorizedResponse(PARTNER_CHECKOUT_UNAUTHORIZED_RESPONSE)
  @ApiOkResponse({
    type: PosCheckoutResponseDto,
    content: {
      'application/json': {
        examples: {
          processedCheckout: {
            summary: 'Processed partner checkout detail',
            value: {
              id: 71,
              branchId: 3,
              partnerCredentialId: 9,
              externalCheckoutId: 'sale-1001',
              idempotencyKey: 'checkout-1001',
              registerId: 'front-1',
              registerSessionId: 11,
              suspendedCartId: null,
              receiptNumber: 'R-1001',
              transactionType: PosCheckoutTransactionType.SALE,
              status: PosCheckoutStatus.PROCESSED,
              currency: 'USD',
              subtotal: 15,
              discountAmount: 0,
              taxAmount: 0,
              total: 15,
              paidAmount: 20,
              changeDue: 5,
              itemCount: 1,
              occurredAt: '2026-04-01T10:00:00.000Z',
              processedAt: '2026-04-01T10:00:05.000Z',
              cashierUserId: null,
              cashierName: 'Lane 1 POS',
              note: null,
              failureReason: null,
              metadata: { source: 'partner-terminal' },
              tenders: [{ method: 'CASH', amount: 20 }],
              items: [
                {
                  productId: 55,
                  sku: 'SKU-55',
                  title: 'Sparkling Water',
                  quantity: 1,
                  unitPrice: 15,
                  discountAmount: 0,
                  taxAmount: 0,
                  lineTotal: 15,
                },
              ],
              createdAt: '2026-04-01T10:00:01.000Z',
              updatedAt: '2026-04-01T10:00:05.000Z',
            },
          },
        },
      },
    },
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId', ParseIntPipe) branchId: number,
    @Req() req: any,
  ) {
    this.partnerCredentialsService.assertCredentialBranchAccess(
      req.partnerCredential,
      branchId,
    );

    return this.posCheckoutService.findOne(id, branchId);
  }

  @Post('partner-ingest')
  @UseGuards(PartnerPosCheckoutWriteGuard, RetailModulesGuard)
  @RequireRetailModules(RetailOsModule.POS_CORE)
  @RetailBranchContext('body.branchId')
  @ApiBody({
    type: IngestPosCheckoutDto,
    examples: {
      saleReceipt: {
        summary: 'Sale receipt from partner terminal',
        value: {
          branchId: 3,
          transactionType: 'SALE',
          externalCheckoutId: 'sale-1001',
          idempotencyKey: 'checkout-1001',
          registerId: 'front-1',
          registerSessionId: 11,
          receiptNumber: 'R-1001',
          currency: 'USD',
          subtotal: 15,
          total: 15,
          paidAmount: 20,
          changeDue: 5,
          occurredAt: '2026-04-01T10:00:00.000Z',
          cashierName: 'Lane 1 POS',
          metadata: { source: 'partner-terminal' },
          items: [
            {
              productId: 55,
              sku: 'SKU-55',
              title: 'Sparkling Water',
              quantity: 1,
              unitPrice: 15,
              lineTotal: 15,
            },
          ],
          tenders: [{ method: 'CASH', amount: 20 }],
        },
      },
    },
  })
  @ApiUnauthorizedResponse(PARTNER_CHECKOUT_UNAUTHORIZED_RESPONSE)
  @ApiCreatedResponse({
    type: PosCheckoutResponseDto,
    content: {
      'application/json': {
        examples: {
          ingestedCheckout: {
            summary: 'Checkout accepted from partner terminal',
            value: {
              id: 71,
              branchId: 3,
              partnerCredentialId: 9,
              externalCheckoutId: 'sale-1001',
              idempotencyKey: 'checkout-1001',
              registerId: 'front-1',
              registerSessionId: 11,
              receiptNumber: 'R-1001',
              transactionType: PosCheckoutTransactionType.SALE,
              status: PosCheckoutStatus.PROCESSED,
              currency: 'USD',
              subtotal: 15,
              discountAmount: 0,
              taxAmount: 0,
              total: 15,
              paidAmount: 20,
              changeDue: 5,
              itemCount: 1,
              occurredAt: '2026-04-01T10:00:00.000Z',
              processedAt: '2026-04-01T10:00:05.000Z',
              cashierName: 'Lane 1 POS',
              metadata: { source: 'partner-terminal' },
              tenders: [{ method: 'CASH', amount: 20 }],
              items: [
                {
                  productId: 55,
                  quantity: 1,
                  unitPrice: 15,
                  discountAmount: 0,
                  taxAmount: 0,
                  lineTotal: 15,
                },
              ],
              createdAt: '2026-04-01T10:00:01.000Z',
              updatedAt: '2026-04-01T10:00:05.000Z',
            },
          },
        },
      },
    },
  })
  ingest(@Body() dto: IngestPosCheckoutDto, @Req() req: any) {
    this.partnerCredentialsService.assertCredentialBranchAccess(
      req.partnerCredential,
      dto.branchId,
    );

    return this.posCheckoutService.ingest(
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
