import { IsString, IsOptional } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  token: string;

  @IsString()
  @IsOptional()
  platform?: string;
}

export class UnregisterDeviceTokenDto {
  @IsString()
  token: string;
}
