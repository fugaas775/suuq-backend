import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosCheckoutTransactionType } from '../entities/pos-checkout.entity';

export class PosCheckoutQuotePromoCodeResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  percentage!: number;

  @ApiProperty()
  minSubtotal!: number;
}

export class PosCheckoutQuoteCustomerPricingRuleResponseDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  discountRate!: number;
}

export class PosCheckoutQuoteLineResponseDto {
  @ApiPropertyOptional()
  lineId?: string | null;

  @ApiPropertyOptional()
  productId?: number | null;

  @ApiPropertyOptional()
  sku?: string | null;

  @ApiPropertyOptional()
  title?: string | null;

  @ApiPropertyOptional()
  category?: string | null;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  taxRate!: number;

  @ApiProperty()
  unitPrice!: number;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  grossSubtotal!: number;

  @ApiProperty()
  customerTypeDiscount!: number;

  @ApiProperty()
  automaticDiscount!: number;

  @ApiProperty()
  promoCodeDiscount!: number;

  @ApiProperty()
  taxableBase!: number;

  @ApiProperty()
  taxAmount!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ isArray: true })
  promotionLabels!: string[];
}

export class PosCheckoutQuoteResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty({ enum: PosCheckoutTransactionType })
  transactionType!: PosCheckoutTransactionType;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ type: [PosCheckoutQuoteLineResponseDto] })
  lines!: PosCheckoutQuoteLineResponseDto[];

  @ApiProperty()
  subtotal!: number;

  @ApiProperty()
  customerTypeDiscount!: number;

  @ApiProperty()
  automaticDiscount!: number;

  @ApiProperty()
  promoCodeDiscount!: number;

  @ApiProperty()
  discountTotal!: number;

  @ApiProperty()
  netSubtotal!: number;

  @ApiProperty()
  taxTotal!: number;

  @ApiProperty()
  grandTotal!: number;

  @ApiProperty()
  totalItems!: number;

  @ApiPropertyOptional({
    type: PosCheckoutQuotePromoCodeResponseDto,
    nullable: true,
  })
  promoCode!: PosCheckoutQuotePromoCodeResponseDto | null;

  @ApiProperty({
    type: PosCheckoutQuoteCustomerPricingRuleResponseDto,
  })
  customerPricingRule!: PosCheckoutQuoteCustomerPricingRuleResponseDto;

  @ApiProperty()
  promoCodeError!: string;

  @ApiProperty({ example: 'BACKEND_QUOTE' })
  pricingSource!: string;
}
