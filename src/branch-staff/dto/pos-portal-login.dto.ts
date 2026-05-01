import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Login DTO for the POS portal that accepts either an email address or a
 * manual branch-staff username as the `identifier`.  Unlike the standard
 * LoginDto, the identifier is NOT required to be a valid RFC-5322 email so
 * that short usernames like "cashier.bole" are accepted.
 */
export class PosPortalLoginDto {
  /**
   * Primary identifier — either an email address or a POS username.
   * When present, `email` and `username` compatibility fields are ignored.
   */
  @IsOptional()
  @IsString()
  identifier?: string;

  /** Compatibility alias for identifier (username form). */
  @IsOptional()
  @IsString()
  username?: string;

  /** Compatibility alias for identifier (email form). */
  @IsOptional()
  @IsString()
  email?: string;

  @IsNotEmpty()
  @IsString()
  password!: string;

  /** Resolved identifier — the first non-empty value of identifier, username, email. */
  resolveIdentifier(): string {
    return (this.identifier || this.username || this.email || '').trim();
  }
}
