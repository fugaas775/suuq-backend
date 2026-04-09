import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString } from 'class-validator';
import { SellerPlanCode } from './seller-workspace-response.dto';

export class UpdateSellerWorkspacePlanDto {
  @ApiProperty({ enum: SellerPlanCode })
  @IsString()
  planCode!: SellerPlanCode;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  primaryRetailTenantId?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
