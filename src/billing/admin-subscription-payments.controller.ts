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
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { SubscriptionPaymentReviewService } from './subscription-payment-review.service';
import { SUBSCRIPTION_PAYMENT_DESTINATIONS } from '../subscription-payments/payment-destinations';

class ApproveSubscriptionPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class RejectSubscriptionPaymentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/**
 * The admin side of subscription payments made by transfer: the queue of
 * payments waiting to be checked against the account, approve / reject, and
 * the collections report.
 */
@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiTags('Admin — Suuq POS')
@Controller('admin/subscription-payments')
export class AdminSubscriptionPaymentsController {
  constructor(
    private readonly review: SubscriptionPaymentReviewService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  async list(@Query('status') status?: string, @Query('limit') limit?: string) {
    return {
      destinations: SUBSCRIPTION_PAYMENT_DESTINATIONS,
      items: await this.review.list({
        status,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Get('report')
  report() {
    return this.review.report();
  }

  @Post(':id/approve')
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveSubscriptionPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const claim = await this.review.approve(id, { id: req.user.id }, dto?.note);
    await this.auditService.log({
      action: 'subscription.payment.approve',
      targetType: 'subscription_payment',
      targetId: id,
      actorId: req.user?.id ?? null,
      actorEmail: req.user?.email ?? null,
      reason: dto?.note || 'Verified against the account',
      meta: {
        referenceId: claim.referenceId,
        kind: claim.kind,
        amount: Number(claim.amount),
        channel: claim.channel,
        payerReference: claim.payerReference,
        branchId: claim.branchId ?? null,
        supplierProfileId: claim.supplierProfileId ?? null,
      },
    });
    return { id: claim.id, status: claim.status, branchId: claim.branchId };
  }

  @Post(':id/reject')
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectSubscriptionPaymentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const claim = await this.review.reject(id, { id: req.user.id }, dto.reason);
    await this.auditService.log({
      action: 'subscription.payment.reject',
      targetType: 'subscription_payment',
      targetId: id,
      actorId: req.user?.id ?? null,
      actorEmail: req.user?.email ?? null,
      reason: dto.reason,
      meta: {
        referenceId: claim.referenceId,
        kind: claim.kind,
        amount: Number(claim.amount),
        channel: claim.channel,
        payerReference: claim.payerReference,
      },
    });
    return { id: claim.id, status: claim.status };
  }
}
