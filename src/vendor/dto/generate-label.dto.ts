import { IsEnum, IsOptional, IsString, IsNumber } from 'class-validator';
import { ShippingCarrier } from '../../common/enums/shipping-carrier.enum';

export class GenerateLabelDto {
  @IsEnum(ShippingCarrier)
  carrier!: ShippingCarrier;

  @IsOptional()
  @IsNumber()
  weight?: number; // in kg

  @IsOptional()
  @IsString()
  dimensions?: string; // e.g. "10x10x10"
}
