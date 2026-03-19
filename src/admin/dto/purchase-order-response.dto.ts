import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '../../purchase-orders/entities/purchase-order.entity';

export class PurchaseOrderItemResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  productId!: number;

  @ApiProperty({ nullable: true })
  supplierOfferId!: number | null;

  @ApiProperty()
  orderedQuantity!: number;

  @ApiProperty()
  receivedQuantity!: number;

  @ApiProperty()
  shortageQuantity!: number;

  @ApiProperty()
  damagedQuantity!: number;

  @ApiProperty({ nullable: true })
  note!: string | null;

  @ApiProperty()
  unitPrice!: number;
}

export class PurchaseOrderAutoReplenishmentStatusResponseDto {
  @ApiProperty()
  isAutoReplenishment!: boolean;

  @ApiProperty({ nullable: true })
  submissionMode!: string | null;

  @ApiProperty({ nullable: true })
  lastAttemptEligible!: boolean | null;

  @ApiProperty({ nullable: true })
  lastAttemptBlockedReason!: string | null;

  @ApiProperty({ nullable: true })
  lastAttemptAt!: string | null;

  @ApiProperty({ nullable: true })
  preferredSupplierProfileId!: number | null;

  @ApiProperty({ nullable: true })
  minimumOrderTotal!: number | null;

  @ApiProperty({ type: Object, nullable: true })
  orderWindow!: Record<string, any> | null;
}

export class PurchaseOrderReevaluationOutcomeResponseDto {
  @ApiProperty({ enum: PurchaseOrderStatus })
  previousStatus!: PurchaseOrderStatus;

  @ApiProperty({ enum: PurchaseOrderStatus })
  nextStatus!: PurchaseOrderStatus;

  @ApiProperty({ nullable: true })
  previousBlockedReason!: string | null;

  @ApiProperty({ nullable: true })
  nextBlockedReason!: string | null;

  @ApiProperty()
  actionTaken!: string;
}

export class AdminPurchaseOrderActionResponseDto {
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

export class PurchaseOrderResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  orderNumber!: string;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  supplierProfileId!: number;

  @ApiProperty({ enum: PurchaseOrderStatus })
  status!: PurchaseOrderStatus;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  subtotal!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ nullable: true })
  expectedDeliveryDate!: string | null;

  @ApiProperty({ type: Object })
  statusMeta!: Record<string, any>;

  @ApiProperty({
    type: PurchaseOrderAutoReplenishmentStatusResponseDto,
    nullable: true,
  })
  autoReplenishmentStatus!: PurchaseOrderAutoReplenishmentStatusResponseDto | null;

  @ApiProperty({ type: [PurchaseOrderItemResponseDto] })
  items!: PurchaseOrderItemResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class AdminPurchaseOrderResponseDto extends PurchaseOrderResponseDto {
  @ApiProperty({ type: [AdminPurchaseOrderActionResponseDto] })
  purchaseOrderActions!: AdminPurchaseOrderActionResponseDto[];
}

export class PurchaseOrderReevaluationResponseDto extends PurchaseOrderResponseDto {
  @ApiProperty({ type: PurchaseOrderReevaluationOutcomeResponseDto })
  reevaluationOutcome!: PurchaseOrderReevaluationOutcomeResponseDto;
}

export class AdminPurchaseOrderReevaluationResponseDto extends AdminPurchaseOrderResponseDto {
  @ApiProperty({ type: PurchaseOrderReevaluationOutcomeResponseDto })
  reevaluationOutcome!: PurchaseOrderReevaluationOutcomeResponseDto;
}
