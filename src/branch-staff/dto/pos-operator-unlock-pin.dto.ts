import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNumber, IsString, Matches, Min } from 'class-validator';
import { OPERATOR_UNLOCK_PIN_LENGTH } from '../pos-operator-pin.util';

const PIN_PATTERN = new RegExp(`^\\d{${OPERATOR_UNLOCK_PIN_LENGTH}}$`);

/**
 * Quick unlock at the register lock screen. `userId` is required because the
 * waiter picks their own tile before typing — the PIN is never used to work out
 * who is signing in.
 */
export class PosOperatorUnlockPinDto {
  @ApiProperty({ example: 42 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  branchId!: number;

  @ApiProperty({
    example: 918,
    description: 'The waiter whose tile was tapped.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @ApiProperty({ example: '4827' })
  @IsString()
  @Transform(({ value }) => String(value ?? '').trim())
  @Matches(PIN_PATTERN, {
    message: `The PIN must be exactly ${OPERATOR_UNLOCK_PIN_LENGTH} digits.`,
  })
  pin!: string;
}
