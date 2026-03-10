import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class StarpayLineItemDto {
  @IsString()
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(1)
  quantity!: number;
}

class StarpayBasePaymentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{4,64}$/)
  referenceId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/)
  customerPhone!: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  billId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class InitiateBankPaymentDto extends StarpayBasePaymentDto {
  @IsString()
  orderId!: string;

  @IsString()
  otpCode!: string;

  @IsOptional()
  @IsString()
  bankCode?: string;
}

export class InitiateWalletPaymentDto extends StarpayBasePaymentDto {
  @IsString()
  orderId!: string;

  @IsString()
  ussdCode!: string;

  @IsOptional()
  @IsString()
  walletProvider?: string;
}

export class GenerateDynamicQrDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._:-]{4,64}$/)
  referenceId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  billId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateServiceDto {
  @IsString()
  serviceCode!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultAmount?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateBillDto {
  @IsString()
  serviceId!: string;

  @IsString()
  customerReference!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StarpayLineItemDto)
  lineItems?: StarpayLineItemDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class StarpayReportQueryDto {
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

export class StarpayHistoryQueryDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;
}

export class VerifyPaymentDto {
  @IsString()
  orderId!: string;
}

export class StarpayResponseDataDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  providerReference?: string;

  @IsOptional()
  @IsObject()
  raw?: Record<string, unknown>;
}

export class StarpayApiResponseDto {
  @IsString()
  status!: string;

  @IsString()
  timestamp!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown> | StarpayResponseDataDto;
}

export class StarpayWebhookDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
