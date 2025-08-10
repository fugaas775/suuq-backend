import { IsString, IsInt, IsOptional } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsInt()
  @IsOptional()
  userId?: number;

  @IsString()
  token: string;

  @IsString()
  @IsOptional()
  platform?: string;
}
