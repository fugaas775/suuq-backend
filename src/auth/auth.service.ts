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
import { UserResponseDto } from '../users/dto/user-response.dto';
import { plainToInstance } from 'class-transformer';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly oauthClient: OAuth2Client | null = null;

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

    const userToCreateData: Partial<User> = {
      firebaseUid,
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
      phoneCountryCode: dto.phoneCountryCode,
      phoneNumber: dto.phoneNumber,
      avatarUrl: dto.avatarUrl,
      storeName: dto.storeName,
      roles: userRoles,
      isActive: true,
    };

    return this.usersService.create(userToCreateData);
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string; user: User }> {
    this.logger.log(`[login] Attempting login for user: ${dto.email}`);
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || !user.isActive || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user);
  }

  async googleLogin(dto: {
    idToken: string;
  }): Promise<{ accessToken: string; refreshToken: string; user: User }> {
    const idToken = dto.idToken;
    this.logger.log(`[googleLogin] Attempting Google login`);
    if (!this.oauthClient) {
      throw new InternalServerErrorException(
        'Google Sign-In is not configured on the server.',
      );
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
    } catch (error: any) {
      throw new UnauthorizedException('Invalid Google token');
    }

    if (!googlePayload?.email) {
      throw new UnauthorizedException(
        'Google account email not found in token',
      );
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
      throw new UnauthorizedException('User account is deactivated.');
    }

    return this.generateTokens(user);
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: User }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      return this.generateTokens(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
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
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
      }),
    ]);

    return { accessToken, refreshToken, user };
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
