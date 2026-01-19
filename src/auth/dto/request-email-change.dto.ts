import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestEmailChangeDto {
  @IsNotEmpty()
  @IsEmail()
  newEmail: string;
}
