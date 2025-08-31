import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  iconUrl?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(mdi:[a-z0-9_\-]+|[a-z0-9_\-]+)$/i, {
    message:
      'iconName must be alphanumeric with dashes/underscores, optional mdi: prefix',
  })
  iconName?: string;
  /**
   * icon fields: clients prefer iconUrl and fall back to iconName.
   * Use mdi: prefix for Material Design Icons when supplying iconName.
   */

  @IsInt()
  @IsOptional()
  parentId?: number;

  @IsInt()
  @IsOptional()
  sortOrder?: number;
}
