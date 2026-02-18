import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
  IsDateString,
} from 'class-validator';
import { DiscountType } from '../entities/coupon.entity';

export class CreateCouponDto {
  @IsString()
  code: string;

  @IsEnum(DiscountType)
  @IsOptional()
  discountType: DiscountType = DiscountType.PERCENTAGE;

  @IsNumber()
  amount: number;

  @IsDateString()
  expiresAt: string;

  @IsNumber()
  @IsOptional()
  usageLimit: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minOrderAmount: number;

  @IsBoolean()
  @IsOptional()
  isActive: boolean;
}
