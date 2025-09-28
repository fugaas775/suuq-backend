import { IsArray, ArrayNotEmpty, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkUserIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  ids!: number[];
}
