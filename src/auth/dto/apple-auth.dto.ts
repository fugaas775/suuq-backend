import { IsOptional, IsString, Length } from 'class-validator';

export class AppleAuthDto {
  // Some clients send identityToken; accept both and resolve in service
  @IsOptional()
  @IsString()
  @Length(8)
  idToken?: string; // aka identityToken

  @IsOptional()
  @IsString()
  @Length(8)
  identityToken?: string;

  @IsOptional()
  @IsString()
  nonce?: string;

  @IsOptional()
  @IsString()
  email?: string; // Provided on first consent only

  @IsOptional()
  @IsString()
  name?: string; // Optional display name from client
}
