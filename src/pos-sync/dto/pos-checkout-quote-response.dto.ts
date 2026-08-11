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

  @ApiPropertyOptional({
    description:
      'Whether this branch charges tax (VAT). When true the branch rate was ' +
      'applied to every line, overriding any rate the client sent.',
  })
  branchTaxEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'The branch tax (VAT) rate applied, as a FRACTION — 0.15 is 15%. Zero ' +
      'when the branch does not charge tax. Lets the register self-audit its ' +
      'local math against the server.',
    example: 0.15,
  })
  branchTaxRate?: number;

  @ApiPropertyOptional({
    description:
      'Whether the branch prices tax-inclusive. When true the line totals are ' +
      'unchanged by tax and the tax was extracted out of them; when false the ' +
      'tax was added on top.',
  })
  branchTaxInclusive?: boolean;
}
