import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyIdentityDto {
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code: string;
}
