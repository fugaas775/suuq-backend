import { ApiProperty } from '@nestjs/swagger';
import { StockMovementResponseDto } from './stock-movement-response.dto';

export class StockMovementPageResponseDto {
  @ApiProperty({ type: [StockMovementResponseDto] })
  items!: StockMovementResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
