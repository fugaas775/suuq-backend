import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  // Accept various alias field names from different clients
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsOptional()
  @IsString()
  oldPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  new_password?: string;

  resolveCurrent(): string | undefined {
    return this.currentPassword ?? this.oldPassword;
  }

  resolveNext(): string | undefined {
    return this.newPassword ?? this.password ?? this.new_password;
  }
}
