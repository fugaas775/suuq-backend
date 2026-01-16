// ...existing code...
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from './roles.enum';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';
// removed unused imports
import { EmailService } from '../email/email.service';
import { AppleAuthDto } from './dto/apple-auth.dto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly oauthClient: OAuth2Client | null = null;
  private appleJwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    const googleClientId = this.configService.get<string>(
      'GOOGLE_WEB_CLIENT_ID',
    );
    if (googleClientId) {
      this.oauthClient = new OAuth2Client(googleClientId);
    } else {
      this.logger.warn(
        'GOOGLE_WEB_CLIENT_ID is not configured. Google Sign-In will be disabled.',
      );
    }
  }

  /** Change password for current user, validating current password if set */
  async changePassword(
    userId: number,
    current: string | undefined,
    next: string,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    // If user has a password set, require current match
    if (user.password) {
      if (!current)
        throw new BadRequestException('Current password is required');
      const ok = await bcrypt.compare(current, user.password);
      if (!ok) throw new UnauthorizedException('Current password is incorrect');
    }
    await this.usersService.changePassword(userId, current, next);
  }

  public getUsersService() {
    return this.usersService;
  }

  async register(dto: RegisterDto): Promise<User> {
    this.logger.log(`[register] Attempting to register user: ${dto.email}`);
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }
    // Security: ignore any client-provided roles to prevent escalation; always assign CUSTOMER
    const userRoles: UserRole[] = [UserRole.CUSTOMER];

    // Optional domain allow/block lists via env
    const allowCsv = this.configService.get<string>('SIGNUP_ALLOWLIST_DOMAINS');
    const blockCsv = this.configService.get<string>('SIGNUP_BLOCKLIST_DOMAINS');
    const emailDomain = dto.email.split('@')[1]?.toLowerCase();
    if (blockCsv) {
      const blocked = blockCsv
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (emailDomain && blocked.includes(emailDomain)) {
        throw new BadRequestException(
          'Registrations from this email domain are not allowed.',
        );
      }
    }
    if (allowCsv) {
      const allowed = allowCsv
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (emailDomain && !allowed.includes(emailDomain)) {
        throw new BadRequestException(
          'Registrations from this email domain are not allowed.',
        );
      }
    }
    const firebaseUid = dto.firebaseUid || `local_${crypto.randomUUID()}`;

    const registrationCountryIso2 = this.normalizeCountryIso2(dto.country);

    const userToCreateData: Partial<User> = {
      firebaseUid,
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
      avatarUrl: dto.avatarUrl,
      storeName: dto.storeName,
      language: dto.language, // Map optional language
      roles: userRoles,
      isActive: true,
      registrationCountry: registrationCountryIso2,
      businessLicenseNumber: dto.businessLicenseNumber,
    };

    const createdUser = await this.usersService.create(userToCreateData);
    if (createdUser && createdUser.email) {
      this.emailService
        .sendWelcomeEmail(createdUser)
        .catch((e) =>
          this.logger.error(`Failed to send welcome email: ${e.message}`),
        );
    }
    return createdUser;
  }

  /**
   * Normalize a country value to ISO-3166-1 alpha-2. Accepts:
   * - Already ISO-2 (e.g., "ET", case-insensitive)
   * - Common country names (e.g., "Ethiopia", "Kenya", "Somalia", "Djibouti")
   * Returns undefined if input is falsy.
   */
  private normalizeCountryIso2(country?: string): string | undefined {
    if (!country) return undefined;
    const c = country.trim();
    if (!c) return undefined;
    if (c.length === 2) return c.toUpperCase();
    const map: Record<string, string> = {
      ethiopia: 'ET',
      et: 'ET',
      kenya: 'KE',
      ke: 'KE',
      somalia: 'SO',
      so: 'SO',
      djibouti: 'DJ',
      dj: 'DJ',
      'united states': 'US',
      usa: 'US',
      us: 'US',
    };
    const key = c.toLowerCase();
    if (map[key]) return map[key];
    // Fallback: take first 2 letters uppercased, but warn in logs
    const iso2 = c.slice(0, 2).toUpperCase();
    this.logger.warn(
      `normalizeCountryIso2: Unknown country "${country}". Falling back to "${iso2}".`,
    );
    return iso2;
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string; user: User }> {
    this.logger.log(`[login] Attempting login for user: ${dto.email}`);
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.password) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      });
    }
    if (!user.isActive) {
      throw new UnauthorizedException({
        code: 'USER_DEACTIVATED',
        message: 'User account is deactivated.',
      });
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      });
    }

    return this.generateTokens(user);
  }

  async googleLogin(dto: {
    idToken: string;
  }): Promise<{ accessToken: string; refreshToken: string; user: User }> {
    const idToken = dto.idToken;
    this.logger.log(`[googleLogin] Attempting Google login`);
    if (!this.oauthClient) {
      throw new InternalServerErrorException({
        code: 'GOOGLE_NOT_CONFIGURED',
        message: 'Google Sign-In is not configured on the server.',
      });
    }

    let googlePayload: TokenPayload | undefined;
    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken: idToken,
        audience: [
          this.configService.get<string>('GOOGLE_WEB_CLIENT_ID'),
          this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
          this.configService.get<string>('GOOGLE_IOS_CLIENT_ID'),
        ].filter((id) => !!id),
      });
      googlePayload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_GOOGLE_TOKEN',
        message: 'Invalid Google token',
      });
    }

    if (!googlePayload?.email) {
      throw new UnauthorizedException({
        code: 'GOOGLE_EMAIL_MISSING',
        message: 'Google account email not found in token',
      });
    }

    let user = await this.usersService.findByEmail(googlePayload.email);

    if (!user) {
      this.logger.log(
        `[googleLogin] User ${googlePayload.email} not found. Creating new user.`,
      );
      user = await this.usersService.createWithGoogle({
        email: googlePayload.email,
        name: googlePayload.name,
        picture: googlePayload.picture,
        sub: googlePayload.sub,
        roles: [UserRole.CUSTOMER],
      });
    } else if (!user.isActive) {
      throw new UnauthorizedException({
        code: 'USER_DEACTIVATED',
        message: 'User account is deactivated.',
      });
    }

    return this.generateTokens(user);
  }

  async appleLogin(
    dto: AppleAuthDto,
  ): Promise<{ accessToken: string; refreshToken: string; user: User }> {
    const idToken = (dto.identityToken || dto.idToken || '').trim();
    if (!idToken) {
      throw new BadRequestException({
        code: 'INVALID_APPLE_TOKEN',
        message: 'idToken (identityToken) is required',
      });
    }

    // Prepare JWKS (cached per process)
    if (!this.appleJwks) {
      this.appleJwks = createRemoteJWKSet(
        new URL('https://appleid.apple.com/auth/keys'),
      );
    }

    // Accepted audiences (bundle IDs or services IDs), comma-separated
    const audienceCsv =
      this.configService.get<string>('APPLE_AUDIENCES') ||
      this.configService.get<string>('APPLE_CLIENT_IDS') ||
      this.configService.get<string>('APPLE_BUNDLE_ID') ||
      '';
    const audiences = audienceCsv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!audiences.length) {
      this.logger.warn(
        'APPLE_AUDIENCES/APPLE_CLIENT_IDS/APPLE_BUNDLE_ID not configured; rejecting Apple Sign-In',
      );
      throw new InternalServerErrorException({
        code: 'APPLE_NOT_CONFIGURED',
        message: 'Apple Sign-In is not configured on the server.',
      });
    }

    let payload: any;
    try {
      const verified = await jwtVerify(idToken, this.appleJwks, {
        issuer: 'https://appleid.apple.com',
        audience: audiences,
      });
      payload = verified.payload as Record<string, any>;
    } catch (e) {
      this.logger.warn(
        `appleLogin: jwt verify failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw new UnauthorizedException({
        code: 'INVALID_APPLE_TOKEN',
        message: 'Invalid Apple token',
      });
    }

    const sub = String(payload.sub || '');
    const emailFromToken =
      typeof payload.email === 'string' ? payload.email : undefined;
    // Some clients also send email in body (first-time only)
    const email = (dto.email || emailFromToken || '').trim().toLowerCase();
    if (!sub) {
      throw new UnauthorizedException({
        code: 'INVALID_APPLE_TOKEN',
        message: 'Missing subject in Apple token',
      });
    }

    // Try by appleId first
    let user = await this.usersService.findByAppleId(sub);
    if (!user && email) {
      // If a user exists with this email, link it
      const existingByEmail = await this.usersService.findByEmail(email);
      if (existingByEmail) {
        // link appleId
        await this.usersService.update(existingByEmail.id, { appleId: sub });
        user = await this.usersService.findById(existingByEmail.id);
      }
    }

    if (!user) {
      if (!email) {
        // Cannot create without email due to unique constraint; ask client to pass email (first-time consent)
        throw new UnauthorizedException({
          code: 'APPLE_EMAIL_MISSING',
          message:
            'Apple did not provide an email. Please grant email access or provide an email to link.',
        });
      }
      user = await this.usersService.createWithApple({
        email,
        sub,
        name: dto.name,
        roles: [UserRole.CUSTOMER],
      });
    } else if (!user.isActive) {
      throw new UnauthorizedException({
        code: 'USER_DEACTIVATED',
        message: 'User account is deactivated.',
      });
    }

    return this.generateTokens(user);
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: User }> {
    // Verify against current + previous refresh secrets. Fallback to JWT_SECRET to ensure
    // backward compatibility if JWT_REFRESH_SECRET was previously unset.
    const trySecrets = this.getRefreshVerificationSecrets();
    type RefreshPayload = {
      tokenType?: string;
      sub: number | string;
      [key: string]: unknown;
    };
    let verified: RefreshPayload | null = null;
    for (const sec of trySecrets) {
      if (!sec) continue;
      try {
        verified = this.jwtService.verify(refreshToken, {
          secret: sec,
          // A tiny skew tolerance can reduce false negatives if clocks drift slightly
          clockTolerance: 5,
        } as any);
        // If signature verified, stop trying others
        break;
      } catch {
        // continue with next secret
      }
    }

    if (!verified) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    }

    // Enforce token type when present; tolerate absence for older tokens
    if (verified.tokenType && verified.tokenType !== 'refresh') {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired refresh token',
      });
    }

    const user = await this.usersService.findById(Number(verified.sub));
    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'USER_INACTIVE',
        message: 'User not found or inactive',
      });
    }

    return this.generateTokens(user);
  }

  private async generateTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string; user: User }> {
    const payload = { sub: user.id, email: user.email, roles: user.roles };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN'),
      }),
      this.jwtService.signAsync(
        { ...payload, tokenType: 'refresh' },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
        },
      ),
    ]);

    return { accessToken, refreshToken, user };
  }

  /**
   * Build an ordered list of secrets to try when verifying refresh tokens.
   * Order: current JWT_REFRESH_SECRET, JWT_REFRESH_PREVIOUS_SECRETS (comma-separated),
   * and finally JWT_SECRET as a backward-compatible fallback.
   */
  private getRefreshVerificationSecrets(): string[] {
    const current = this.configService.get<string>('JWT_REFRESH_SECRET');
    const previousCsv = this.configService.get<string>(
      'JWT_REFRESH_PREVIOUS_SECRETS',
    );
    const previous = (previousCsv || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const fallback = this.configService.get<string>('JWT_SECRET');
    const list = [current, ...previous, fallback].filter(
      (s): s is string => typeof s === 'string' && s.length > 0,
    );
    if (!list.length) {
      // No secrets configured; log a warning so operators can fix envs.
      this.logger.warn(
        'No refresh token verification secrets configured. Set JWT_REFRESH_SECRET.',
      );
    }
    return list;
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return {
        message:
          'If an account with that email exists, a password reset link has been sent.',
      };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    const passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour

    await this.usersService.update(user.id, {
      passwordResetToken,
      passwordResetExpires,
    });

    await this.emailService.sendPasswordResetEmail(user.email, resetToken);
    return {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.usersService.findByResetToken(hashedToken);

    if (!user) {
      throw new UnauthorizedException(
        'Password reset token is invalid or has expired.',
      );
    }

    await this.usersService.update(user.id, {
      password: newPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    });

    return { message: 'Password has been successfully reset.' };
  }
}
