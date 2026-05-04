import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class VoidPosCheckoutDto {
  @ApiPropertyOptional({
    description:
      'Branch scope for entitlement and permission checks when the caller cannot provide it in the query string.',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  branchId?: number;

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
