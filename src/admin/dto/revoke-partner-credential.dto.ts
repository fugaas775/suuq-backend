import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RevokePartnerCredentialDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
