// Backend: src/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  InternalServerErrorException,
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly oauthClient: OAuth2Client | null = null;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const googleClientId = this.configService.get<string>('GOOGLE_WEB_CLIENT_ID');
    if (googleClientId) {
      this.oauthClient = new OAuth2Client(googleClientId);
    } else {
      this.logger.warn('GOOGLE_WEB_CLIENT_ID is not configured. Google Sign-In will be disabled.');
    }
  }

  async register(dto: RegisterDto): Promise<{ message: string; user: UserResponseDto }> {
    this.logger.log(`[register] Attempting to register user: ${dto.email}`);
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      this.logger.warn(`[register] Email ${dto.email} already in use.`);
      throw new ConflictException('Email already in use');
    }

    try {
      const userRoles: UserRole[] = dto.roles?.length ? dto.roles : [UserRole.CUSTOMER];

      // Pass the plain-text password directly. The UsersService will handle hashing.
      const userToCreateData: Partial<User> = {
        firebaseUid: dto.firebaseUid,
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

      const createdUser = await this.usersService.create(userToCreateData);
      
      this.logger.log(`[register] User ${dto.email} created successfully with ID: ${createdUser.id}`);
      const userResponse = plainToInstance(UserResponseDto, createdUser, {
        excludeExtraneousValues: true,
      });
      return {
        message: 'User registered successfully',
        user: userResponse,
      };
    } catch (error: any) {
      this.logger.error(`[register] Error during user creation for ${dto.email}: ${error.message}`, error.stack);
      if (error.code === '23505') {
        throw new ConflictException('A user with this email or Firebase UID already exists.');
      }
      throw new InternalServerErrorException('User registration failed due to a server error.');
    }
  }

  async login(dto: LoginDto): Promise<{ access_token: string; refreshToken: string; user: UserResponseDto }> {
    this.logger.log(`[login] Attempting login for user: ${dto.email}`);
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || !user.isActive || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email, roles: user.roles };
    const access_token = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'refreshSecret',
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    const userResponse = plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
    return { access_token, refreshToken, user: userResponse };
  }

  async googleLogin(dto: { idToken: string }): Promise<{ access_token: string; refreshToken: string; user: UserResponseDto }> {
    const idToken = dto.idToken;
    this.logger.log(`[googleLogin] Attempting Google login`);
    if (!this.oauthClient) {
      this.logger.error('[googleLogin] OAuth2Client not initialized.');
      throw new InternalServerErrorException('Google Sign-In is not configured on the server.');
    }

    let googlePayload: TokenPayload | undefined;
    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken: idToken,
        audience: [
          this.configService.get<string>('GOOGLE_WEB_CLIENT_ID')!,
          this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID')!,
          this.configService.get<string>('GOOGLE_IOS_CLIENT_ID')!,
        ].filter(id => !!id), // Filter out any undefined client IDs
      });
      googlePayload = ticket.getPayload();
    } catch (error: any) {
      this.logger.error(`[googleLogin] Invalid Google ID token: ${error.message}`);
      throw new UnauthorizedException('Invalid Google token');
    }

    if (!googlePayload?.email) {
      this.logger.warn('[googleLogin] Google token payload did not contain an email.');
      throw new UnauthorizedException('Google account email not found in token');
    }
    
    let user = await this.usersService.findByEmail(googlePayload.email);

    if (!user) {
      this.logger.log(`[googleLogin] User ${googlePayload.email} not found. Creating new user.`);
      try {
        // --- THIS IS THE FIX ---
        // Correctly map the googlePayload properties to the expected method signature.
        user = await this.usersService.createWithGoogle({
          email: googlePayload.email,
          name: googlePayload.name,         // Use 'name'
          picture: googlePayload.picture,  // Use 'picture'
          sub: googlePayload.sub,          // Use 'sub' for the googleId
          roles: [UserRole.CUSTOMER],
        });
        this.logger.log(`[googleLogin] New user created via Google: ${user.email}, ID: ${user.id}`);
      } catch (error: any) {
        this.logger.error(`[googleLogin] Error creating user for ${googlePayload.email}: ${error.message}`);
        throw new InternalServerErrorException('Could not create user account for Google Sign-In.');
      }
    } else {
      this.logger.log(`[googleLogin] Existing user found: ${user.email}`);
      if (!user.isActive) {
        throw new UnauthorizedException('User account is deactivated.');
      }
    }

    const payload = { sub: user.id, email: user.email, roles: user.roles };
    const access_token = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'refreshSecret',
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    const userResponse = plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
    return { access_token, refreshToken, user: userResponse };
  }

  async refreshToken(refreshToken: string): Promise<{ access_token: string; refreshToken: string; user: UserResponseDto }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') || process.env.JWT_REFRESH_SECRET || 'refreshSecret',
      });

      const user = await this.usersService.findById(payload.sub);

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      const newPayload = { sub: user.id, email: user.email, roles: user.roles };
      const access_token = this.jwtService.sign(newPayload, {
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN') || '1h',
      });

      const newRefreshToken = this.jwtService.sign(newPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') || process.env.JWT_REFRESH_SECRET || 'refreshSecret',
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
      });

      const userResponse = plainToInstance(UserResponseDto, user, {
        excludeExtraneousValues: true,
      });

      return {
        access_token,
        refreshToken: newRefreshToken,
        user: userResponse,
      };
    } catch (error: any) {
      this.logger.error(`[refreshToken] Invalid or expired refresh token: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

async forgotPassword(email: string): Promise<{ message: string }> {
    this.logger.log(`[forgotPassword] Password reset request for email: ${email}`);
    const user = await this.usersService.findByEmail(email);

    // IMPORTANT: For security, we always return a success message,
    // even if the user is not found, to prevent email enumeration attacks.
    if (!user) {
      this.logger.warn(`[forgotPassword] User not found for email: ${email}, but returning success message.`);
      return { message: 'If an account with that email exists, a password reset link has been sent.' };
    }

    // 1. Generate a secure, random token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // 2. Hash the token before saving it to the database for security
    const passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // 3. Set an expiry date (e.g., 1 hour from now)
    const passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour

    // 4. Save the hashed token and expiry date to the user record
    await this.usersService.update(user.id, {
      passwordResetToken,
      passwordResetExpires,
    });
    this.logger.log(`[forgotPassword] Reset token generated and saved for user: ${email}`);

    // 5. TODO: Implement your email sending logic here
    // You will need an email service (like Nodemailer or SendGrid) to send the email.
    // The email should contain a link like: https://suuq.ugasfuad.com/reset-password?token=${resetToken}
    this.logger.log(`[forgotPassword] TODO: Send email to ${email} with reset token: ${resetToken}`);

    return { message: 'If an account with that email exists, a password reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    this.logger.log(`[resetPassword] Attempting to reset password with token.`);

    // 1. Hash the incoming token to match the one stored in the DB
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // 2. Find the user by the hashed token and check if the token has not expired
    const user = await this.usersService.findByResetToken(hashedToken); // We will add this method next

    if (!user) {
      this.logger.warn(`[resetPassword] Invalid or expired token provided.`);
      throw new UnauthorizedException('Password reset token is invalid or has expired.');
    }

    // 3. Set the new password and clear the reset token fields
    user.password = newPassword; // The 'update' service will hash this for us
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await this.usersService.update(user.id, {
      password: user.password,
      passwordResetToken: undefined, // Set to null in DB
      passwordResetExpires: undefined, // Set to null in DB
    });

    this.logger.log(`[resetPassword] Password has been successfully reset for user ID: ${user.id}`);
    return { message: 'Password has been successfully reset.' };
  }

}