import { ApiProperty } from '@nestjs/swagger';

export class StylistSummaryRowDto {
  @ApiProperty({
    description: 'Stylist display name as captured at time of sale.',
  })
  stylistName!: string;

  @ApiProperty({ description: 'Number of receipts this stylist appeared on.' })
  receiptsCount!: number;

  @ApiProperty({
    description: 'Total services performed (sum of line quantities).',
  })
  servicesCount!: number;

  @ApiProperty({
    description:
      'Total revenue from lines attributed to this stylist (minor-currency units).',
  })
  revenue!: number;
}

export class StylistSummaryResponseDto {
  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({
    description: 'ISO-8601 window start, or null if not filtered.',
  })
  fromAt!: string | null;

  @ApiProperty({ description: 'ISO-8601 window end, or null if not filtered.' })
  toAt!: string | null;

  @ApiProperty({
    description:
      'Total tip amount across all SALE checkouts in the window (minor-currency units).',
  })
  totalTips!: number;

  @ApiProperty({
    description: 'Number of SALE checkouts that included a non-zero tip.',
  })
  tippedReceiptsCount!: number;

  @ApiProperty({ type: [StylistSummaryRowDto] })
  stylists!: StylistSummaryRowDto[];
}
