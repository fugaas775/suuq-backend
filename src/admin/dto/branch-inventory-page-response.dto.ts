import { ApiProperty } from '@nestjs/swagger';
import { BranchInventoryResponseDto } from './branch-inventory-response.dto';

export class BranchInventoryPageResponseDto {
  @ApiProperty({ type: [BranchInventoryResponseDto] })
  items!: BranchInventoryResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
