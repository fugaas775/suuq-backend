import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
} from 'class-validator';

export class ToggleAutoRenewDto {
  @IsBoolean()
  @IsNotEmpty()
  enabled: boolean;
}

export class ExtendSubscriptionDto {
  @IsNumber()
  @Min(1)
  days: number;

  @IsString()
  @IsNotEmpty()
  reason: string;
}
