import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class CreateBranchTransferItemDto {
  @Type(() => Number)
  @IsNumber()
  productId!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateBranchTransferDto {
  @Type(() => Number)
  @IsNumber()
  fromBranchId!: number;

  @Type(() => Number)
  @IsNumber()
  toBranchId!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBranchTransferItemDto)
  items!: CreateBranchTransferItemDto[];
}

export { CreateBranchTransferItemDto };
