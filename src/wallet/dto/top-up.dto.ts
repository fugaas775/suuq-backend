import {
  IsNumber,
  Min,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class TopUpDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  method: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsObject()
  userDetails?: {
    id: number;
    email: string;
    name: string;
  };

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
