import { IsOptional, IsString, IsEnum, IsInt, IsIn, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../auth/roles.enum';
import { VerificationStatus } from '../entities/user.entity';

export class FindUsersQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;

  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  isActive?: number; // treat 1=true 0=false for query simplicity

  @IsOptional()
  @IsString()
  createdFrom?: string; // ISO date

  @IsOptional()
  @IsString()
  createdTo?: string; // ISO date

  @IsOptional()
  @IsString()
  @IsIn(['id', 'email', 'displayName', 'createdAt', 'verificationStatus'])
  sortBy?: 'id' | 'email' | 'displayName' | 'createdAt' | 'verificationStatus';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  // You can add pagination params here later if needed
  // @IsOptional() @Type(() => Number) @IsNumber() page?: number;
  // @IsOptional() @Type(() => Number) @IsNumber() perPage?: number;
}
