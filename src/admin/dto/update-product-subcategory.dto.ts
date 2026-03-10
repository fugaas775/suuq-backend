import { Transform, Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateProductSubcategoryDto {
  @Transform(({ value, obj }) => value ?? obj?.categoryId)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  subcategoryId!: number;
}
