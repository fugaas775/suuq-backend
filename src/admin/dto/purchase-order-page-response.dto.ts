import { ApiProperty } from '@nestjs/swagger';
import { AdminPurchaseOrderResponseDto } from './purchase-order-response.dto';

export class PurchaseOrderBlockedReasonCountResponseDto {
  @ApiProperty()
  reason!: string;

  @ApiProperty()
  count!: number;
}

export class PurchaseOrderListSummaryResponseDto {
  @ApiProperty()
  totalPurchaseOrders!: number;

  @ApiProperty()
  autoReplenishmentCount!: number;

  @ApiProperty()
  autoSubmitDraftCount!: number;

  @ApiProperty()
  blockedAutoSubmitDraftCount!: number;

  @ApiProperty()
  readyAutoSubmitDraftCount!: number;

  @ApiProperty({ type: [PurchaseOrderBlockedReasonCountResponseDto] })
  blockedReasonBreakdown!: PurchaseOrderBlockedReasonCountResponseDto[];
}

export class PurchaseOrderPageResponseDto {
  @ApiProperty({ type: PurchaseOrderListSummaryResponseDto })
  summary!: PurchaseOrderListSummaryResponseDto;

  @ApiProperty({ type: [AdminPurchaseOrderResponseDto] })
  items!: AdminPurchaseOrderResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
