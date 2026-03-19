import { ApiProperty } from '@nestjs/swagger';
import {
  PurchaseOrderReevaluationOutcomeResponseDto,
  PurchaseOrderResponseDto,
} from '../../admin/dto/purchase-order-response.dto';

export class RetailReplenishmentBlockedReasonCountResponseDto {
  @ApiProperty()
  reason!: string;

  @ApiProperty()
  count!: number;
}

export class RetailReplenishmentReviewSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  totalDrafts!: number;

  @ApiProperty()
  staleDraftCount!: number;

  @ApiProperty()
  totalDraftValue!: number;

  @ApiProperty()
  supplierCount!: number;

  @ApiProperty()
  autoSubmitDraftCount!: number;

  @ApiProperty()
  blockedAutoSubmitDraftCount!: number;

  @ApiProperty()
  readyAutoSubmitDraftCount!: number;

  @ApiProperty({ type: [RetailReplenishmentBlockedReasonCountResponseDto] })
  blockedReasonBreakdown!: RetailReplenishmentBlockedReasonCountResponseDto[];
}

export class RetailReplenishmentActionResponseDto {
  @ApiProperty()
  type!: string;

  @ApiProperty()
  method!: string;

  @ApiProperty()
  path!: string;

  @ApiProperty({ type: Object, nullable: true })
  query!: Record<string, string | number | boolean> | null;

  @ApiProperty()
  enabled!: boolean;
}

export class RetailReplenishmentPurchaseOrderResponseDto extends PurchaseOrderResponseDto {
  @ApiProperty({ type: [RetailReplenishmentActionResponseDto] })
  replenishmentActions!: RetailReplenishmentActionResponseDto[];
}

export class RetailReplenishmentReevaluationResponseDto extends RetailReplenishmentPurchaseOrderResponseDto {
  @ApiProperty({ type: PurchaseOrderReevaluationOutcomeResponseDto })
  reevaluationOutcome!: PurchaseOrderReevaluationOutcomeResponseDto;
}

export class RetailReplenishmentReviewResponseDto {
  @ApiProperty({ type: RetailReplenishmentReviewSummaryResponseDto })
  summary!: RetailReplenishmentReviewSummaryResponseDto;

  @ApiProperty({ type: [RetailReplenishmentPurchaseOrderResponseDto] })
  items!: RetailReplenishmentPurchaseOrderResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
