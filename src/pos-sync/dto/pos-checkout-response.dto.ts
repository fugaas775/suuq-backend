import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductAliasType } from '../../product-aliases/entities/product-alias.entity';
import {
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from '../entities/pos-checkout.entity';

export class PosCheckoutTenderResponseDto {
  @ApiProperty()
  method!: string;

  @ApiProperty()
  amount!: number;

  @ApiPropertyOptional()
  reference?: string | null;

  @ApiPropertyOptional()
  note?: string | null;

  @ApiPropertyOptional({ type: Object })
  metadata?: Record<string, any> | null;
}

export class PosCheckoutItemResponseDto {
  @ApiPropertyOptional()
  productId?: number | null;

  @ApiPropertyOptional({ enum: ProductAliasType })
  aliasType?: ProductAliasType | null;

  @ApiPropertyOptional()
  aliasValue?: string | null;

  @ApiPropertyOptional()
  sku?: string | null;

  @ApiPropertyOptional()
  title?: string | null;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unitPrice!: number;

  @ApiProperty()
  discountAmount!: number;

  @ApiProperty()
  taxAmount!: number;

  @ApiProperty()
  lineTotal!: number;

  @ApiPropertyOptional()
  note?: string | null;

  @ApiPropertyOptional()
  reasonCode?: string | null;

  @ApiPropertyOptional({ type: Object })
  metadata?: Record<string, any> | null;
}

export class PosCheckoutListItemResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  branchId!: number;

  @ApiPropertyOptional()
  partnerCredentialId?: number | null;

  @ApiPropertyOptional()
  externalCheckoutId?: string | null;

  @ApiPropertyOptional()
  idempotencyKey?: string | null;

  @ApiPropertyOptional()
  registerId?: string | null;

  @ApiPropertyOptional()
  registerSessionId?: number | null;

  @ApiPropertyOptional()
  suspendedCartId?: number | null;

  @ApiPropertyOptional()
  receiptNumber?: string | null;

  @ApiProperty({ enum: PosCheckoutTransactionType })
  transactionType!: PosCheckoutTransactionType;

  @ApiProperty({ enum: PosCheckoutStatus })
  status!: PosCheckoutStatus;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  subtotal!: number;

  @ApiProperty()
  discountAmount!: number;

  @ApiProperty()
  taxAmount!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  paidAmount!: number;

  @ApiProperty()
  changeDue!: number;

  @ApiProperty()
  itemCount!: number;

  @ApiProperty()
  occurredAt!: Date;

  @ApiPropertyOptional()
  processedAt?: Date | null;

  @ApiPropertyOptional()
  cashierUserId?: number | null;

  @ApiPropertyOptional()
  cashierName?: string | null;

  @ApiPropertyOptional()
  note?: string | null;

  @ApiPropertyOptional()
  failureReason?: string | null;

  @ApiPropertyOptional()
  sourceReceiptId?: string | null;

  @ApiPropertyOptional()
  sourceReceiptNumber?: string | null;

  @ApiPropertyOptional()
  refundMethod?: string | null;

  @ApiPropertyOptional({ type: Object })
  pricingSummary?: Record<string, any> | null;

  @ApiPropertyOptional({ type: Object })
  customerProfile?: Record<string, any> | null;

  @ApiPropertyOptional({ type: Object })
  loyaltySummary?: Record<string, any> | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PosCheckoutResponseDto extends PosCheckoutListItemResponseDto {
  @ApiPropertyOptional({ type: Object })
  metadata?: Record<string, any> | null;

  @ApiProperty({ type: [PosCheckoutTenderResponseDto] })
  tenders!: PosCheckoutTenderResponseDto[];

  @ApiProperty({ type: [PosCheckoutItemResponseDto] })
  items!: PosCheckoutItemResponseDto[];
}

export class PosCheckoutPageResponseDto {
  @ApiProperty({ type: [PosCheckoutListItemResponseDto] })
  items!: PosCheckoutListItemResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
