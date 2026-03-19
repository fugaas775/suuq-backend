import { ApiProperty } from '@nestjs/swagger';
import { BranchTransferResponseDto } from './branch-transfer-response.dto';

export class BranchTransferPageResponseDto {
  @ApiProperty({ type: [BranchTransferResponseDto] })
  items!: BranchTransferResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
