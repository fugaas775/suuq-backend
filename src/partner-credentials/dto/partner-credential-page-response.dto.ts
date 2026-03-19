import { ApiProperty } from '@nestjs/swagger';
import { PartnerCredentialResponseDto } from './partner-credential-response.dto';

export class PartnerCredentialPageResponseDto {
  @ApiProperty({ type: [PartnerCredentialResponseDto] })
  items!: PartnerCredentialResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
