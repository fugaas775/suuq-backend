import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Buyer responds to a supplier counter-offer (CHANGES_PROPOSED). ACCEPT applies
 * the proposed line changes and advances to ACKNOWLEDGED; REJECT cancels.
 */
export class RespondPurchaseOrderChangesDto {
  @ApiProperty({ enum: ['ACCEPT', 'REJECT'] })
  @IsIn(['ACCEPT', 'REJECT'])
  decision!: 'ACCEPT' | 'REJECT';

  @ApiPropertyOptional({ example: 'Agreed — proceed.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
