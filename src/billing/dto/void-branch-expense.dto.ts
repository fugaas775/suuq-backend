import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Voiding an expense costs a sentence.
 *
 * The reason is the whole point of a void: the row survives, so the books can
 * answer "why is this not counted" without anyone having to remember. Same bar
 * `DecidePurchaseRunDto` sets for voiding a purchase run.
 */
export class VoidBranchExpenseDto {
  @ApiProperty({ example: 'Keyed twice — this is the duplicate.' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
