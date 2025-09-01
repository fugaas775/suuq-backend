import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['light', 'dark'])
  theme?: 'light' | 'dark';

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  notificationsEnabled?: boolean;
}
