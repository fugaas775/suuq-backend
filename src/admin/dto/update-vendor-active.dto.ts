import { IsBoolean } from 'class-validator';

export class UpdateVendorActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
