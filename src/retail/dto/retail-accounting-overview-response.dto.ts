import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';
import { PurchaseOrderReceiptDiscrepancyStatus } from '../../purchase-orders/entities/purchase-order-receipt-event.entity';

export class RetailAccountingActionResponseDto {
  @ApiProperty()
  type!: string;

  @ApiProperty()
  method!: string;

  @ApiProperty()
  path!: string;

  @ApiProperty({ type: Object, nullable: true })
  body!: Record<string, any> | null;

  @ApiProperty()
  enabled!: boolean;
}

export class RetailAccountingAgingBucketResponseDto {
  @ApiProperty()
  under24Hours!: number;

  @ApiProperty()
  between24And72Hours!: number;

  @ApiProperty()
  over72Hours!: number;
}

export class RetailAccountingPriorityQueueSummaryResponseDto {
  @ApiProperty()
  critical!: number;

  @ApiProperty()
  high!: number;

  @ApiProperty()
  normal!: number;
}

export class RetailAccountingAlertResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty({ enum: ['INFO', 'WATCH', 'CRITICAL'] })
  severity!: 'INFO' | 'WATCH' | 'CRITICAL';

  @ApiProperty()
  title!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ nullable: true })
  metric!: number | null;

  @ApiProperty({ nullable: true })
  action!: string | null;
}

export class RetailAccountingOverviewSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  openCommitmentCount!: number;

  @ApiProperty()
  openCommitmentValue!: number;

  @ApiProperty()
  receivedPendingReconciliationCount!: number;

  @ApiProperty()
  receivedPendingReconciliationValue!: number;

  @ApiProperty()
  discrepancyOpenCount!: number;

  @ApiProperty()
  discrepancyResolvedCount!: number;

  @ApiProperty()
  discrepancyApprovedCount!: number;

  @ApiProperty()
  reconcileReadyCount!: number;

  @ApiProperty()
  oldestOpenCommitmentAgeHours!: number;

  @ApiProperty()
  oldestReceivedPendingReconciliationAgeHours!: number;

  @ApiProperty({ type: [Object] })
  supplierExposure!: Array<{
    supplierProfileId: number;
    openCommitmentCount: number;
    openCommitmentValue: number;
    receivedPendingReconciliationCount: number;
    discrepancyOpenCount: number;
    shortageUnitCount: number;
    damagedUnitCount: number;
    shortageValue: number;
    damagedValue: number;
  }>;

  @ApiProperty({ type: RetailAccountingAgingBucketResponseDto })
  discrepancyOpenAgingBuckets!: RetailAccountingAgingBucketResponseDto;

  @ApiProperty({ type: RetailAccountingAgingBucketResponseDto })
  discrepancyAwaitingApprovalAgingBuckets!: RetailAccountingAgingBucketResponseDto;

  @ApiProperty({ type: RetailAccountingPriorityQueueSummaryResponseDto })
  priorityQueue!: RetailAccountingPriorityQueueSummaryResponseDto;
}

export class RetailAccountingOverviewItemResponseDto {
  @ApiProperty()
  purchaseOrderId!: number;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty({ enum: PurchaseOrderStatus })
  status!: PurchaseOrderStatus;

  @ApiProperty()
  supplierProfileId!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  outstandingUnitCount!: number;

  @ApiProperty()
  shortageUnitCount!: number;

  @ApiProperty()
  damagedUnitCount!: number;

  @ApiProperty()
  orderAgeHours!: number;

  @ApiProperty({
    enum: [
      'OPEN_COMMITMENT',
      'RECEIVED_PENDING_RECONCILIATION',
      'DISCREPANCY_REVIEW',
      'DISCREPANCY_AWAITING_APPROVAL',
      'READY_TO_RECONCILE',
    ],
  })
  accountingState!:
    | 'OPEN_COMMITMENT'
    | 'RECEIVED_PENDING_RECONCILIATION'
    | 'DISCREPANCY_REVIEW'
    | 'DISCREPANCY_AWAITING_APPROVAL'
    | 'READY_TO_RECONCILE';

  @ApiProperty({ enum: PurchaseOrderReceiptDiscrepancyStatus, nullable: true })
  lastDiscrepancyStatus!: PurchaseOrderReceiptDiscrepancyStatus | null;

  @ApiProperty({ nullable: true })
  lastReceiptEventId!: number | null;

  @ApiProperty({ nullable: true })
  lastReceiptEventAgeHours!: number | null;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'] })
  priority!: 'CRITICAL' | 'HIGH' | 'NORMAL';

  @ApiProperty()
  priorityReason!: string;

  @ApiProperty({ type: [RetailAccountingActionResponseDto] })
  actions!: RetailAccountingActionResponseDto[];
}

export class RetailAccountingOverviewResponseDto {
  @ApiProperty({ type: RetailAccountingOverviewSummaryResponseDto })
  summary!: RetailAccountingOverviewSummaryResponseDto;

  @ApiProperty({ type: [RetailAccountingAlertResponseDto] })
  alerts!: RetailAccountingAlertResponseDto[];

  @ApiProperty({ type: [RetailAccountingOverviewItemResponseDto] })
  items!: RetailAccountingOverviewItemResponseDto[];
}
