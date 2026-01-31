import { IsArray, IsNumber } from 'class-validator';

export class DeleteProductRequestsDto {
  @IsArray()
  @IsNumber({}, { each: true })
  ids!: number[];
}
