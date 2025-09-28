import { IsOptional, IsString, Matches, Length } from 'class-validator';

export class VerifyCodeDto {
  @IsString()
  @Matches(/^[+0-9]{7,16}$/,{ message: 'phone must contain digits and may start with +' })
  phone: string;

  @IsString()
  @Length(4, 10)
  code: string;

  @IsOptional()
  @IsString()
  region?: 'ET' | 'SO' | 'KE' | 'DJ';
}
