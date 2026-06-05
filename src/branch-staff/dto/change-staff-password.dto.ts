import { IsString, MinLength } from 'class-validator';

export class ChangeStaffPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
