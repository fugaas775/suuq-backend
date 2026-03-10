import { Transform } from 'class-transformer';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class RegisterDeviceTokenDto {
  @Transform(
    ({ value, obj }) =>
      value ??
      obj?.fcmToken ??
      obj?.deviceToken ??
      obj?.fcm_token ??
      obj?.device_token,
  )
  @IsString()
  @IsNotEmpty()
  token: string;

  @Transform(
    ({ value, obj }) => value ?? obj?.devicePlatform ?? obj?.device_platform,
  )
  @IsString()
  @IsOptional()
  platform?: string;
}

export class UnregisterDeviceTokenDto {
  @IsString()
  token: string;
}
