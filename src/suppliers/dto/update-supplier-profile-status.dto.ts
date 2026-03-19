import { IsEnum } from 'class-validator';
import { SupplierOnboardingStatus } from '../entities/supplier-profile.entity';

export class UpdateSupplierProfileStatusDto {
  @IsEnum(SupplierOnboardingStatus)
  status!: SupplierOnboardingStatus;
}
