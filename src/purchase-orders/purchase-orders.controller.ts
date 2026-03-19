import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { ApprovePurchaseOrderReceiptDiscrepancyDto } from './dto/approve-purchase-order-receipt-discrepancy.dto';
import { AcknowledgePurchaseOrderReceiptDto } from './dto/acknowledge-purchase-order-receipt.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { PurchaseOrderReceiptEventResponseDto } from './dto/purchase-order-receipt-event-response.dto';
import { RecordPurchaseOrderReceiptDto } from './dto/record-purchase-order-receipt.dto';
import { ResolvePurchaseOrderReceiptDiscrepancyDto } from './dto/resolve-purchase-order-receipt-discrepancy.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderReevaluationResponseDto } from '../admin/dto/purchase-order-response.dto';

@ApiTags('B2B Purchase Orders')
@Controller('hub/v1/purchase-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Get()
  @ApiOperation({
    summary: 'List purchase orders visible to the current B2B role set',
  })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
    UserRole.SUPPLIER_ACCOUNT,
  )
  findAll() {
    return this.purchaseOrdersService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft purchase order' })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrdersService.create(dto);
  }

  @Post(':id/re-evaluate-auto-replenishment')
  @ApiOperation({
    summary:
      'Re-evaluate an auto-replenishment draft against the current automation policy and submit it when now eligible',
  })
  @ApiOkResponse({ type: PurchaseOrderReevaluationResponseDto })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  reevaluateAutoReplenishmentDraft(
    @Param('id', ParseIntPipe) id: number,
    @Req() req,
  ) {
    return this.purchaseOrdersService
      .reevaluateAutoReplenishmentDraftDetailed(id, {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
      })
      .then((result) => ({
        ...result.purchaseOrder,
        reevaluationOutcome: result.outcome,
      }));
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Change purchase-order status and optionally include receipt lines for a RECEIVED transition',
  })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
    UserRole.SUPPLIER_ACCOUNT,
  )
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderStatusDto,
    @Req() req,
  ) {
    return this.purchaseOrdersService.updateStatus(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Get(':id/receipt-events')
  @ApiOperation({
    summary: 'List receipt events recorded for a purchase order',
  })
  @ApiOkResponse({ type: PurchaseOrderReceiptEventResponseDto, isArray: true })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
    UserRole.SUPPLIER_ACCOUNT,
  )
  listReceiptEvents(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseOrdersService.listReceiptEvents(id);
  }

  @Post(':id/receipt-events')
  @ApiOperation({
    summary:
      'Record an incremental receipt event for a shipped or received purchase order',
  })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  recordReceiptEvent(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPurchaseOrderReceiptDto,
    @Req() req,
  ) {
    return this.purchaseOrdersService.recordReceiptEvent(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
      roles: req.user?.roles ?? [],
    });
  }

  @Patch(':id/receipt-events/:eventId/acknowledge')
  @ApiOperation({
    summary: 'Allow a supplier account to acknowledge a recorded receipt event',
  })
  @ApiBody({ type: AcknowledgePurchaseOrderReceiptDto, required: false })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPLIER_ACCOUNT)
  acknowledgeReceiptEvent(
    @Param('id', ParseIntPipe) id: number,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() dto: AcknowledgePurchaseOrderReceiptDto,
    @Req() req,
  ) {
    return this.purchaseOrdersService.acknowledgeReceiptEvent(
      id,
      eventId,
      dto,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
      },
    );
  }

  @Patch(':id/receipt-events/:eventId/discrepancy-resolution')
  @ApiOperation({
    summary:
      'Allow a supplier account to resolve shortages or damage recorded on a receipt event',
  })
  @ApiBody({ type: ResolvePurchaseOrderReceiptDiscrepancyDto })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPLIER_ACCOUNT)
  resolveReceiptEventDiscrepancy(
    @Param('id', ParseIntPipe) id: number,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() dto: ResolvePurchaseOrderReceiptDiscrepancyDto,
    @Req() req,
  ) {
    return this.purchaseOrdersService.resolveReceiptEventDiscrepancy(
      id,
      eventId,
      dto,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
      },
    );
  }

  @Patch(':id/receipt-events/:eventId/discrepancy-approval')
  @ApiOperation({
    summary:
      'Allow a buyer or admin to approve a supplier-submitted discrepancy resolution',
  })
  @ApiBody({ type: ApprovePurchaseOrderReceiptDiscrepancyDto, required: false })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.POS_MANAGER,
    UserRole.B2B_BUYER,
  )
  approveReceiptEventDiscrepancy(
    @Param('id', ParseIntPipe) id: number,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() dto: ApprovePurchaseOrderReceiptDiscrepancyDto,
    @Req() req,
  ) {
    return this.purchaseOrdersService.approveReceiptEventDiscrepancy(
      id,
      eventId,
      dto,
      {
        id: req.user?.id ?? null,
        email: req.user?.email ?? null,
        roles: req.user?.roles ?? [],
      },
    );
  }
}
