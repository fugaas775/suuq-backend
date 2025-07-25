import { IsNotEmpty, IsOptional, IsString, IsNumber, IsArray } from 'class-validator';

export class CreateVendorProductDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsNumber()
  price!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  stock?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  categoryIds?: number[];

  @IsNotEmpty()
  @IsString()
  currency!: string; // e.g., 'ETB', 'KES'
  // Add more optional fields as needed
}
