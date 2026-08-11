import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Supplier declines an incoming purchase order outright (SUBMITTED → DECLINED).
 * A reason is required so the buyer understands why and can re-draft.
 */
export class DeclinePurchaseOrderDto {
  @ApiProperty({
    example: 'Out of stock until next month',
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
