import { IsOptional, IsString, MinLength } from 'class-validator';

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
  @MinLength(6)
  newPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  new_password?: string;

  resolveCurrent(): string | undefined {
    return this.currentPassword ?? this.oldPassword;
  }

  resolveNext(): string | undefined {
    return this.newPassword ?? this.password ?? this.new_password;
  }
}
