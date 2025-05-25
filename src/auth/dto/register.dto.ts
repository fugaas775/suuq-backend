import { IsEmail, IsEnum, MinLength } from 'class-validator';
import { UserRole } from '../../users/user.entity';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @MinLength(6)
  password!: string;

  @IsEnum(['CUSTOMER', 'VENDOR', 'DELIVERER'])
  role!: UserRole;
}
