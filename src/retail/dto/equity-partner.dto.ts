import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EquityPartnerStatus } from '../entities/equity-partner.entity';

function trimStr(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

/** Posted by the seller to apply for the equity partner program. */
export class ApplyEquityPartnerDto {
  @Transform(({ value }) => trimStr(value))
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName!: string;

  @Transform(({ value }) => trimStr(value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  phone!: string;

  /** Optional bank / mobile-money details. */
  @IsOptional()
  @IsObject()
  bankAccountInfo?: Record<string, string>;
}

/** PATCH body used by admin to update status, bank info, or notes. */
export class UpdateEquityPartnerDto {
  @IsOptional()
  @IsEnum(EquityPartnerStatus)
  status?: EquityPartnerStatus;

  @IsOptional()
  @IsObject()
  bankAccountInfo?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Tier numerator for cascade payout to this partner's referrer (default 1). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  tierNumerator?: number;

  /** Tier denominator for cascade payout to this partner's referrer (default 10). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  tierDenominator?: number;

  /** Set the partner that referred this partner (for cascade payouts). */
  @IsOptional()
  @IsInt()
  @Min(1)
  referrerEquityPartnerId?: number;
}

/** PATCH body for updating a single split assignment numerator/denominator. */
export class UpdateEquitySplitAssignmentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  splitNumerator?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  splitDenominator?: number;
}

/** POST body to mark a pending payout as paid. */
export class MarkPayoutPaidDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
