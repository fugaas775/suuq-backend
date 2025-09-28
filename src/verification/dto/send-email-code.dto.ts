import { IsEmail, IsNotEmpty } from 'class-validator';

export class SendEmailCodeDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
