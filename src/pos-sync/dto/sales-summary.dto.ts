import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsISO8601, IsNumber, IsOptional } from 'class-validator';

export class SalesSummaryQueryDto {
  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @ApiPropertyOptional({ example: '2026-04-23T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  fromAt?: string;

  @ApiPropertyOptional({ example: '2026-04-23T23:59:59.999Z' })
  @IsOptional()
  @IsISO8601()
  toAt?: string;
}

export class SalesSummaryTenderDto {
  @ApiProperty({ example: 'CASH' })
  method!: string;

  @ApiProperty({ example: 12400 })
  amount!: number;
}

export class SalesSummaryOperatorDto {
  @ApiProperty({ example: 'Amina' })
  operator!: string;

  @ApiProperty({ example: 18 })
  salesCount!: number;

  @ApiProperty({ example: 12400 })
  salesGross!: number;

  @ApiProperty({ example: 1 })
  returnsCount!: number;

  @ApiProperty({ example: 150 })
  returnsGross!: number;

  @ApiProperty({ example: 12250 })
  netSales!: number;

  @ApiProperty({ example: 688.9 })
  avgBasket!: number;

  @ApiProperty({ example: 0.012 })
  returnRate!: number;
}

/**
 * The window's takings, computed over EVERY checkout in it.
 *
 * The reports hub derives the same figures on the device from the checkout rows
 * it managed to page in, and it stops at fifty pages of a hundred. Past five
 * thousand checkouts in a window every total it showed was short, and the only
 * honest thing it could do was say so. This is the same arithmetic with no cap:
 * one query, one pass, whatever the branch actually did.
 *
 * The per-checkout drill-downs the client builds (top items, hourly curve, the
 * per-operator receipt list) are deliberately NOT here. They are only meaningful
 * against rows a reader can expand, and shipping ten thousand of them to a phone
 * to render a table of ten is the problem, not the fix.
 */
export class SalesSummaryResponseDto {
  @ApiProperty({ example: 'ETB' })
  currency!: string;

  @ApiProperty({ example: 12400 })
  salesGross!: number;

  @ApiProperty({ example: 18 })
  salesCount!: number;

  @ApiProperty({ example: 1616.52 })
  salesTax!: number;

  @ApiProperty({ example: 150 })
  returnsGross!: number;

  @ApiProperty({ example: 1 })
  returnsCount!: number;

  @ApiProperty({ example: 19.56 })
  returnsTax!: number;

  @ApiProperty({ example: 1596.96 })
  taxTotal!: number;

  @ApiProperty({ example: 12250 })
  netSales!: number;

  @ApiProperty({ example: 10653.04 })
  netSalesExTax!: number;

  @ApiProperty({ example: 688.89 })
  averageBasket!: number;

  @ApiProperty({ type: [SalesSummaryTenderDto] })
  tenderBreakdown!: SalesSummaryTenderDto[];

  @ApiProperty({ type: [SalesSummaryOperatorDto] })
  operatorBreakdown!: SalesSummaryOperatorDto[];

  @ApiPropertyOptional({ example: '2026-04-23T06:12:00.000Z', nullable: true })
  firstAt!: string | null;

  @ApiPropertyOptional({ example: '2026-04-23T20:41:00.000Z', nullable: true })
  lastAt!: string | null;

  @ApiProperty({
    example: 19,
    description:
      'Rows the summary was computed over. Uncapped — this is the whole window.',
  })
  checkoutCount!: number;
}
