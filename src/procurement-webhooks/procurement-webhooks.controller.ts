import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateProcurementWebhookSubscriptionDto } from './dto/create-procurement-webhook-subscription.dto';
import { ProcurementWebhookDeliveryQueryDto } from './dto/procurement-webhook-delivery-query.dto';
import {
  ProcurementWebhookBulkReplayResponseDto,
  ProcurementWebhookBulkReplayPreviewResponseDto,
  ProcurementWebhookDeliveryPageResponseDto,
  ProcurementWebhookDeliveryResponseDto,
  ProcurementWebhookHealthSummaryResponseDto,
  ProcurementWebhookReplayGovernanceSummaryResponseDto,
  ProcurementWebhookReplayOperationPageResponseDto,
  ProcurementWebhookSubscriptionDetailResponseDto,
  ProcurementWebhookSubscriptionPageResponseDto,
  ProcurementWebhookSubscriptionRemediationActionPageResponseDto,
  ProcurementWebhookSubscriptionResponseDto,
  ProcurementWebhookSubscriptionStatusUpdateResponseDto,
} from './dto/procurement-webhook-response.dto';
import { ProcurementWebhookRemediationActionQueryDto } from './dto/procurement-webhook-remediation-action-query.dto';
import { ProcurementWebhookReplayOperationQueryDto } from './dto/procurement-webhook-replay-operation-query.dto';
import { ProcurementWebhookReplayOperationSummaryQueryDto } from './dto/procurement-webhook-replay-operation-summary-query.dto';
import { ProcurementWebhookSubscriptionQueryDto } from './dto/procurement-webhook-subscription-query.dto';
import { ReplayProcurementWebhookDeliveryDto } from './dto/replay-procurement-webhook-delivery.dto';
import { ReplayTerminalProcurementWebhookDeliveriesDto } from './dto/replay-terminal-procurement-webhook-deliveries.dto';
import { UpdateProcurementWebhookSubscriptionStatusDto } from './dto/update-procurement-webhook-subscription-status.dto';
import { ProcurementWebhooksService } from './procurement-webhooks.service';

@ApiTags('Admin - Procurement Webhooks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/b2b/procurement-webhooks')
export class ProcurementWebhooksController {
  constructor(
    private readonly procurementWebhooksService: ProcurementWebhooksService,
  ) {}

  @Post('subscriptions')
  @ApiOperation({ summary: 'Create a procurement webhook subscription' })
  @ApiCreatedResponse({ type: ProcurementWebhookSubscriptionResponseDto })
  createSubscription(
    @Body() dto: CreateProcurementWebhookSubscriptionDto,
    @Req() req: any,
  ) {
    return this.procurementWebhooksService.createSubscription(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'List procurement webhook subscriptions' })
  @ApiOkResponse({ type: ProcurementWebhookSubscriptionPageResponseDto })
  listSubscriptions(@Query() query: ProcurementWebhookSubscriptionQueryDto) {
    return this.procurementWebhooksService.listSubscriptions(query);
  }

  @Get('subscriptions/:id')
  @ApiOperation({
    summary: 'Get procurement webhook subscription operational detail',
  })
  @ApiOkResponse({ type: ProcurementWebhookSubscriptionDetailResponseDto })
  getSubscriptionDetail(@Param('id', ParseIntPipe) id: number) {
    return this.procurementWebhooksService.getSubscriptionDetail(id);
  }

  @Get('subscriptions/:id/remediation-actions')
  @ApiOperation({
    summary: 'List remediation actions for a procurement webhook subscription',
  })
  @ApiOkResponse({
    type: ProcurementWebhookSubscriptionRemediationActionPageResponseDto,
  })
  listSubscriptionRemediationActions(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ProcurementWebhookRemediationActionQueryDto,
  ) {
    return this.procurementWebhooksService.listSubscriptionRemediationActions(
      id,
      query,
    );
  }

  @Patch('subscriptions/:id/status')
  @ApiOperation({
    summary: 'Pause or resume a procurement webhook subscription',
  })
  @ApiOkResponse({
    type: ProcurementWebhookSubscriptionStatusUpdateResponseDto,
  })
  updateSubscriptionStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProcurementWebhookSubscriptionStatusDto,
    @Req() req: any,
  ) {
    return this.procurementWebhooksService.updateSubscriptionStatus(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'List procurement webhook delivery logs' })
  @ApiOkResponse({ type: ProcurementWebhookDeliveryPageResponseDto })
  listDeliveries(@Query() query: ProcurementWebhookDeliveryQueryDto) {
    return this.procurementWebhooksService.listDeliveries(query);
  }

  @Get('health-summary')
  @ApiOperation({
    summary:
      'Get procurement webhook health totals, retry pressure, and recent terminal failures',
  })
  @ApiOkResponse({ type: ProcurementWebhookHealthSummaryResponseDto })
  getHealthSummary() {
    return this.procurementWebhooksService.getHealthSummary();
  }

  @Post('deliveries/replay-terminal-failures')
  @ApiOperation({
    summary:
      'Bulk replay terminal procurement webhook failures after partner or endpoint remediation',
  })
  @ApiCreatedResponse({ type: ProcurementWebhookBulkReplayResponseDto })
  replayTerminalFailures(
    @Body() dto: ReplayTerminalProcurementWebhookDeliveriesDto,
    @Req() req: any,
  ) {
    return this.procurementWebhooksService.replayTerminalFailures(dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }

  @Post('deliveries/replay-terminal-failures/preview')
  @ApiOperation({
    summary:
      'Preview which terminal procurement webhook failures would be replayed before executing bulk remediation',
  })
  @ApiOkResponse({ type: ProcurementWebhookBulkReplayPreviewResponseDto })
  previewReplayTerminalFailures(
    @Body() dto: ReplayTerminalProcurementWebhookDeliveriesDto,
  ) {
    return this.procurementWebhooksService.previewReplayTerminalFailures(dto);
  }

  @Post('deliveries/:id/replay')
  @ApiOperation({ summary: 'Replay a procurement webhook delivery' })
  @ApiCreatedResponse({ type: ProcurementWebhookDeliveryResponseDto })
  replayDelivery(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplayProcurementWebhookDeliveryDto,
    @Req() req: any,
  ) {
    return this.procurementWebhooksService.replayDelivery(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }

  @Get('replay-operations/summary')
  @ApiOperation({
    summary: 'Summarize procurement webhook replay governance activity',
  })
  @ApiOkResponse({ type: ProcurementWebhookReplayGovernanceSummaryResponseDto })
  getReplayOperationsSummary(
    @Query() query: ProcurementWebhookReplayOperationSummaryQueryDto,
  ) {
    return this.procurementWebhooksService.getReplayOperationsSummary(query);
  }

  @Get('replay-operations/summary/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary:
      'Export procurement webhook replay governance summary metrics as CSV',
  })
  async exportReplayOperationsSummary(
    @Res() res: Response,
    @Query() query: ProcurementWebhookReplayOperationSummaryQueryDto,
  ) {
    const csv =
      await this.procurementWebhooksService.exportReplayOperationsSummaryCsv(
        query,
      );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="procurement_webhook_replay_governance_summary_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('replay-operations/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary: 'Export procurement webhook replay operations as CSV',
  })
  async exportReplayOperations(
    @Res() res: Response,
    @Query() query: ProcurementWebhookReplayOperationQueryDto,
  ) {
    const csv =
      await this.procurementWebhooksService.exportReplayOperationsCsv(query);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="procurement_webhook_replay_operations_${Date.now()}.csv"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get('replay-operations')
  @ApiOperation({ summary: 'List procurement webhook replay operations' })
  @ApiOkResponse({ type: ProcurementWebhookReplayOperationPageResponseDto })
  listReplayOperations(
    @Query() query: ProcurementWebhookReplayOperationQueryDto,
  ) {
    return this.procurementWebhooksService.listReplayOperations(query);
  }
}
