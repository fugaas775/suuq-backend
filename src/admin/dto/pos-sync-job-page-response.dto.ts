import { ApiProperty } from '@nestjs/swagger';
import { PosSyncJobResponseDto } from './pos-sync-job-response.dto';

export class PosSyncJobPageResponseDto {
  @ApiProperty({ type: [PosSyncJobResponseDto] })
  items!: PosSyncJobResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
