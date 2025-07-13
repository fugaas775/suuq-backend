import { IsOptional, IsString, IsEnum } from 'class-validator';
import { UserRole } from '../../auth/roles.enum';

export class FindUsersQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  search?: string;

  // You can add pagination params here later if needed
  // @IsOptional() @Type(() => Number) @IsNumber() page?: number;
  // @IsOptional() @Type(() => Number) @IsNumber() perPage?: number;
}
