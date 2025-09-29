import { IsString, IsNotEmpty, IsOptional, IsInt, Matches, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  slug?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(https?:\/\/|\/|data:).+/i, {
    message: 'iconUrl must be http(s), leading-slash path, or data URI',
  })
  @IsOptional()
  iconUrl?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(mdi:[a-z0-9_-]+|[a-z0-9_-]+)$/i, {
    message:
      'iconName must be alphanumeric with dashes/underscores, optional mdi: prefix',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  iconName?: string;
  /**
   * icon fields: clients prefer iconUrl and fall back to iconName.
   * Use mdi: prefix for Material Design Icons when supplying iconName.
   */

  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value === null || value === undefined || value === '' ? undefined : Number(value)))
  parentId?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Transform(({ value }) => (value === null || value === undefined || value === '' ? undefined : Number(value)))
  sortOrder?: number;
}
