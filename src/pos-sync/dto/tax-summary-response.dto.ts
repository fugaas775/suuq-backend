import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TaxSummaryRateBucketDto {
  @ApiProperty({
    description: 'Tax rate as a decimal (0.15 == 15%).',
    example: 0.15,
  })
  rate!: number;

  @ApiProperty({ description: 'Human label, e.g. "15%" or "Zero-rated".' })
  label!: string;

  @ApiProperty({ description: 'Net taxable base in window currency.' })
  taxableBase!: number;

  @ApiProperty({ description: 'Tax collected in window currency.' })
  taxAmount!: number;

  @ApiProperty({
    description: 'Number of contributing line items (sales − returns).',
  })
  lineCount!: number;
}

export class TaxSummaryShiftDto {
  @ApiPropertyOptional()
  registerSessionId?: number | null;

  @ApiPropertyOptional()
  registerId?: string | null;

  @ApiProperty()
  taxableBase!: number;

  @ApiProperty()
  zeroRatedBase!: number;

  @ApiProperty()
  taxAmount!: number;

  @ApiProperty({ description: 'Tax ÷ taxable base. 0 if no taxable activity.' })
  effectiveRate!: number;
}

export class TaxSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({
    description: 'ISO8601 lower bound used for aggregation.',
    nullable: true,
  })
  fromAt!: string | null;

  @ApiProperty({
    description: 'ISO8601 upper bound used for aggregation.',
    nullable: true,
  })
  toAt!: string | null;

  @ApiProperty({ description: 'Net taxable base across non-zero rates.' })
  taxableBase!: number;

  @ApiProperty({ description: 'Net base of zero-rated activity.' })
  zeroRatedBase!: number;

  @ApiProperty()
  taxAmount!: number;

  @ApiProperty({ description: 'Tax ÷ taxable base. 0 if no taxable activity.' })
  effectiveRate!: number;

  @ApiProperty()
  settledCount!: number;

  @ApiProperty()
  returnCount!: number;

  @ApiProperty({ type: [TaxSummaryRateBucketDto] })
  breakdown!: TaxSummaryRateBucketDto[];

  @ApiProperty({ type: [TaxSummaryShiftDto] })
  shifts!: TaxSummaryShiftDto[];
}
