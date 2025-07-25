import { IsString, IsOptional, IsInt } from 'class-validator';

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  iconUrl?: string;

  @IsString()
  @IsOptional()
  iconName?: string;

  @IsInt()
  @IsOptional()
  parentId?: number | null; // Allow setting parent to null for root categories

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}