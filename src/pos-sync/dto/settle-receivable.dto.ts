import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReceivableTenderDto {
  @IsString()
  @MaxLength(64)
  method!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  reference?: string;
}

/**
 * Records a customer paying down an OPEN accounts-receivable balance after the
 * original sale. Mirrors the pos-s `buildReceivableSettlementPayload` shape.
 */
export class SettleReceivableDto {
  @Type(() => Number)
  @IsNumber()
  branchId!: number;

  @IsString()
  @MaxLength(255)
  idempotencyKey!: string;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsString()
  @MaxLength(128)
  originalReceiptNumber!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  settledAmount!: number;

  @IsOptional()
  @IsDateString()
  settledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  customerReference?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivableTenderDto)
  tenders?: ReceivableTenderDto[];
}
