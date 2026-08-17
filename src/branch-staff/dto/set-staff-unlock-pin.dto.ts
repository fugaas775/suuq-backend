import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { OPERATOR_UNLOCK_PIN_LENGTH } from '../pos-operator-pin.util';

const PIN_PATTERN = new RegExp(`^\\d{${OPERATOR_UNLOCK_PIN_LENGTH}}$`);

export class SetStaffUnlockPinDto {
  @ApiProperty({
    description: `Exactly ${OPERATOR_UNLOCK_PIN_LENGTH} digits. Register quick-unlock PIN for a QSR waiter.`,
    example: '4827',
  })
  @IsString()
  @Transform(({ value }) => String(value ?? '').trim())
  @Matches(PIN_PATTERN, {
    message: `The PIN must be exactly ${OPERATOR_UNLOCK_PIN_LENGTH} digits.`,
  })
  pin!: string;
}
