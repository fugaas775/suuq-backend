import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SUBSCRIPTION_PAYMENT_CHANNELS } from '../payment-destinations';

/**
 * What a customer tells us about a transfer they have made. Mixed into every
 * "I have paid" request body — branch renewal, new branch, supplier, BNPL.
 */
export class PaymentProofDto {
  @ApiProperty({ example: 'CBE', description: 'EBIRR | CBE' })
  @IsIn([...SUBSCRIPTION_PAYMENT_CHANNELS])
  channel!: string;

  @ApiProperty({
    example: 'FT24123ABCD',
    description: 'The transaction number on the customer’s own receipt.',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/u, {
    message:
      'payerReference must be the transaction number from your receipt (letters and digits).',
  })
  payerReference!: string;

  @ApiPropertyOptional({ description: 'Name or number the money came from.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  payerName?: string;

  @ApiPropertyOptional({
    description: 'URL of the uploaded receipt (image or PDF).',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  receiptUrl?: string;
}
