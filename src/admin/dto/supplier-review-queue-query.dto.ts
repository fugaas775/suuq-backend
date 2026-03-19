import { IsEnum, IsOptional } from 'class-validator';
import { SupplierOnboardingStatus } from '../../suppliers/entities/supplier-profile.entity';

export class SupplierReviewQueueQueryDto {
  @IsOptional()
  @IsEnum(SupplierOnboardingStatus)
  status?: SupplierOnboardingStatus;
}
