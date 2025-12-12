import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  IsISO8601,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ProductRequestStatus } from '../entities/product-request.entity';

export class UpdateProductRequestStatusDto {
  @IsEnum(ProductRequestStatus)
  status!: ProductRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;

  @IsOptional()
  @IsISO8601()
  @Transform(({ value }) => (value ? new Date(value) : undefined))
  closedAt?: Date;
}
