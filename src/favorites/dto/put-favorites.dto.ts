import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional } from 'class-validator';

export class PutFavoritesDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @ArrayUnique()
  @IsInt({ each: true })
  ids!: number[];

  @IsOptional()
  @IsBoolean()
  partial?: boolean = false;
}
