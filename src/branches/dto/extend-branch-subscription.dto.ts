import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * An admin-recorded renewal: a further paid period granted by hand, for money
 * taken outside Ebirr or as goodwill.
 */
export class ExtendBranchSubscriptionDto {
  @ApiProperty({ example: 6, description: 'Length of the new term in months.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months!: number;

  @ApiProperty({
    example: 'Paid 23,400 ETB by bank transfer on 1 Nov 2026',
    description: 'Why the term is being granted; kept on the audit log.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    example: 23400,
    description:
      'Amount collected for the whole term. Defaults to the platform rate ' +
      '(3,900 ETB a month) × months; 0 records a free extension.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountTotal?: number;
}
