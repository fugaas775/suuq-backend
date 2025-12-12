import { IsOptional, IsString, IsEnum, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../auth/roles.enum';
import { VerificationStatus } from '../entities/user.entity';

export class FindUsersQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  // Exact user id filter (advanced token: id:123)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id?: number;

  // Field-specific filters added for advanced admin search tokens
  // email:foo@bar, name:john, store:mart
  @IsOptional()
  @IsString()
  email?: string;

  // Alias for displayName (token: name:john)
  @IsOptional()
  @IsString()
  name?: string;

  // Alias for storeName (token: store:acme)
  @IsOptional()
  @IsString()
  store?: string;

  @IsOptional()
  @IsString()
  search?: string;

  // Search aliases accepted by admin UI
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  term?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;

  // Alias for pageSize preferred by admin UI for export batching
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  isActive?: number; // treat 1=true 0=false for query simplicity

  // Direct active alias (token: active:1). Precedence order for activity resolution:
  // status -> isActive -> active
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  active?: number;

  // Human-friendly status alias used by admin UI: active|inactive
  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

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

  // Presence of verification documents (token: hasdocs:true / hasdocs:false / hasdocs:1 / hasdocs:0)
  // Stored internally as string for flexible parsing in service.
  @IsOptional()
  @IsString()
  @IsIn(['true', 'false', '1', '0'])
  hasdocs?: string;

  // You can add pagination params here later if needed
  // @IsOptional() @Type(() => Number) @IsNumber() page?: number;
  // @IsOptional() @Type(() => Number) @IsNumber() perPage?: number;
}
