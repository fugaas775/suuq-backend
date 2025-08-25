import { IsEnum, IsOptional, IsString } from 'class-validator';
import { VerificationStatus } from '../../users/entities/user.entity';

export class UpdateVendorVerificationDto {
  @IsEnum(VerificationStatus)
  status!: VerificationStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
