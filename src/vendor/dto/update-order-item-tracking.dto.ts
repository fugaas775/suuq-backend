import { IsOptional, IsString } from 'class-validator';

export class UpdateOrderItemTrackingDto {
  @IsOptional()
  @IsString()
  trackingCarrier?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  trackingUrl?: string;
}
