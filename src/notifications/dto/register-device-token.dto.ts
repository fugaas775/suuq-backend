import { IsString, IsInt, IsOptional } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsInt()
  userId: number;

  @IsString()
  token: string;

  @IsString()
  @IsOptional()
  platform?: string;
}
