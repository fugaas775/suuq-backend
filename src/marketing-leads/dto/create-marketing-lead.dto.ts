import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateMarketingLeadDto {
  @IsOptional()
  @IsString()
  @Length(2, 8)
  language?: string;

  @IsString()
  @Length(1, 120)
  type!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @Length(3, 5000)
  message!: string;
}
