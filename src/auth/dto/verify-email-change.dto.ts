import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyEmailChangeDto {
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code: string;
}
