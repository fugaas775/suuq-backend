import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Body for `POST /pos-portal/auth/google/complete` — redeems the one-time code
 * the OAuth redirect callback handed back to the SPA via the URL fragment.
 */
export class GoogleCompleteDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
