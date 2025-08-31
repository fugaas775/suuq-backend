import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';

export class PatchFavoritesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ArrayUnique()
  @IsInt({ each: true })
  add?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ArrayUnique()
  @IsInt({ each: true })
  remove?: number[];

  @IsOptional()
  @IsBoolean()
  append?: boolean = true;

  @IsOptional()
  @IsBoolean()
  partial?: boolean = false;
}
