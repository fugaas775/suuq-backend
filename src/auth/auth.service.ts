import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/user.entity';
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

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    this.logger.log(`[register] Password hashed for ${dto.email}`);

    try {
      const userRoles: UserRole[] = dto.roles ? dto.roles : (dto.role ? [dto.role] : [UserRole.CUSTOMER]);

      const userToCreateData: Partial<User> = {
        email: dto.email,
        password: hashedPassword,
        displayName: dto.displayName,
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
      throw new InternalServerErrorException('User registration failed.');
    }
  }

  async login(dto: LoginDto): Promise<{ access_token: string; refreshToken: string; user: UserResponseDto }> {
    this.logger.log(`[login] Attempting login for user: ${dto.email}`);
    
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      this.logger.warn(`[login] User not found: ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }
    this.logger.log(`[login] User found: ${user.email}, isActive: ${user.isActive}, Roles from DB: ${JSON.stringify(user.roles)}`);

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Create payload for JWT
    const payload = { sub: user.id, email: user.email, roles: user.roles };

    // Generate access token
    const access_token = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN') || '1h',
    });

    // Generate refresh token (typically longer expiry)
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET') || process.env.JWT_REFRESH_SECRET || 'refreshSecret',
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    const userResponse = plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });

    return { access_token, refreshToken, user: userResponse };
  }

  /**
   * Google Login
   * @param dto GoogleAuthDto or raw idToken (you may want to change the signature to accept GoogleAuthDto)
   */
  async googleLogin(dto: { idToken: string }): Promise<{ access_token: string; refreshToken: string; user: UserResponseDto }> {
    const idToken = dto.idToken;
    this.logger.log(`[googleLogin] Attempting Google login with ID token (length: ${idToken?.length})`);
    if (!this.oauthClient) {
      this.logger.error('[googleLogin] OAuth2Client not initialized (GOOGLE_WEB_CLIENT_ID missing or invalid).');
      throw new InternalServerErrorException('Google Sign-In is not configured on the server.');
    }

    let googlePayload: TokenPayload | undefined;
    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken: idToken,
        audience: this.configService.get<string>('GOOGLE_WEB_CLIENT_ID'),
      });
      googlePayload = ticket.getPayload();
    } catch (error: any) {
      this.logger.error(`[googleLogin] Invalid Google ID token: ${error.message}`, error.stack);
      throw new UnauthorizedException('Invalid Google token');
    }

    if (!googlePayload?.email) {
      this.logger.warn('[googleLogin] Google token payload did not contain an email.');
      throw new UnauthorizedException('Google account email not found in token');
    }
    this.logger.log(`[googleLogin] Google token verified for email: ${googlePayload.email}`);

    let user = await this.usersService.findByEmail(googlePayload.email);

    if (!user) {
      this.logger.log(`[googleLogin] User ${googlePayload.email} not found. Creating new user.`);
      try {
        user = await this.usersService.create({
          email: googlePayload.email,
          displayName: googlePayload.name,
          avatarUrl: googlePayload.picture,
          roles: [UserRole.CUSTOMER],
          password: `google_sso_${Date.now()}_${Math.random().toString(36).substring(2)}`,
          isActive: true,
        });
        this.logger.log(`[googleLogin] New user created via Google: ${user.email}, ID: ${user.id}`);
      } catch (error: any) {
        this.logger.error(`[googleLogin] Error creating user for ${googlePayload.email}: ${error.message}`, error.stack);
        throw new InternalServerErrorException('Could not create user account for Google Sign-In.');
      }
    } else {
      this.logger.log(`[googleLogin] Existing user found: ${user.email}, ID: ${user.id}, isActive: ${user.isActive}`);
      if (!user.isActive) {
        this.logger.warn(`[googleLogin] User account (via Google) is deactivated: ${user.email}`);
        throw new UnauthorizedException('User account is deactivated.');
      }
    }

    const rolesForPayload = Array.isArray(user.roles) ? user.roles : [];
    if (rolesForPayload.length === 0) {
      this.logger.warn(`[googleLogin] User ${user.email} has no roles. This might be an issue.`);
    }

    const jwtPayload = {
      sub: user.id,
      email: user.email,
      roles: rolesForPayload,
    };
    this.logger.log(`[googleLogin] Generating JWT for user: ${user.email} with payload: ${JSON.stringify(jwtPayload)}`);

    const accessToken = this.jwtService.sign(jwtPayload, {
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN') || '1h',
    });
    const refreshToken = this.jwtService.sign(jwtPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET') || process.env.JWT_REFRESH_SECRET || 'refreshSecret',
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    const userResponse = plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });

    return {
      access_token: accessToken,
      refreshToken,
      user: userResponse,
    };
  }
}
