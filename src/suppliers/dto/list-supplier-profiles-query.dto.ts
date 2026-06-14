import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { SupplierOnboardingStatus } from '../entities/supplier-profile.entity';

export class ListSupplierProfilesQueryDto {
  @ApiPropertyOptional({ enum: SupplierOnboardingStatus })
  @IsOptional()
  @IsEnum(SupplierOnboardingStatus)
  status?: SupplierOnboardingStatus;
}
