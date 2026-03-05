import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsNumber,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFeedInteractionDto {
  @ApiProperty({ description: 'The ID of the product interacted with' })
  @ValidateIf((o) => typeof o.productId === 'string')
  @IsString()
  @ValidateIf((o) => typeof o.productId === 'number')
  @IsNumber()
  @IsNotEmpty()
  productId: string | number;

  @ApiProperty({
    description: 'The action performed on the product',
    example: 'click',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['click', 'add_to_cart', 'buy_now', 'impression', 'wishlist'])
  action: string;

  @ApiPropertyOptional({ description: 'The request ID from the feed response' })
  @IsString()
  @IsOptional()
  requestId?: string;
}
