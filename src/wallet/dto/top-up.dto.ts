import {
  IsNumber,
  Min,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
} from 'class-validator';

export class TopUpDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  method: string;

  @IsString()
  @IsNotEmpty()
  reference: string;

  @IsOptional()
  @IsObject()
  userDetails?: {
    id: number;
    email: string;
    name: string;
  };
}
