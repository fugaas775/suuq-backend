import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Listing a supplier's own product to shoppers on suuq-s.com.
 *
 * `retailPrice` is deliberately separate from the offer's `unitWholesalePrice`:
 * one product, two audiences, two prices. Omitting it leaves whatever consumer
 * price is already set (so unlisting and re-listing does not ask again), but a
 * first listing without one is refused — the shelf would otherwise fall back to
 * `product.price`, which for a supplier product *is* the wholesale price.
 */
export class SetOfferConsumerListingDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  consumerVisible!: boolean;

  @ApiPropertyOptional({
    example: 120,
    description:
      'Price shoppers pay. Required the first time an offer is listed publicly.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  retailPrice?: number | null;
}
