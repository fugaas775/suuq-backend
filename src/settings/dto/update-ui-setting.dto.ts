import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class UpdateUiSettingDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  key?: string;

  // Allow arbitrary JSON value; coercion handled in service.
  @IsOptional()
  value?: unknown;
}
