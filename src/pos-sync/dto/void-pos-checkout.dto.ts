import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class VoidPosCheckoutDto {
  @ApiPropertyOptional({
    description: 'Free-text reason stored on the audit trail.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Id of the operator/manager who authorised the void. Falls back to the request principal.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  authorisedByUserId?: number;
}
