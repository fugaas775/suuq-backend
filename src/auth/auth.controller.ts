import {
  Controller,
  Post,
  Get,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserRole } from './roles.enum';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: number;
    email: string;
    roles: UserRole[];
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * --- UPDATED REGISTER METHOD ---
   * Creates the user and then immediately logs them in to return access tokens.
   */
  @Post('register')
  @HttpCode(HttpStatus.OK) // Return 200 OK since it now logs in
  async register(@Body() dto: RegisterDto) {
    // Step 1: Register the user. This will throw an error if it fails.
    await this.authService.register(dto);

    // Step 2: If registration is successful, immediately log the new user in.
    const loginDto: LoginDto = { email: dto.email, password: dto.password };
    const { access_token, refreshToken, user } = await this.authService.login(loginDto);
    
    // Step 3: Return the same response structure as the /login endpoint.
    return {
      accessToken: access_token,
      refreshToken,
      user: plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const { access_token, refreshToken, user } = await this.authService.login(dto);
    return {
      accessToken: access_token,
      refreshToken,
      user: plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    };
  }

  // This endpoint can now be simplified or removed, as the main /register handles it.
  // Kept for legacy purposes if another app uses it.
  @Post('register-deliverer')
  async registerDeliverer(@Body() dto: Omit<RegisterDto, 'roles' | 'firebaseUid'>) {
    const loginDto: LoginDto = { email: dto.email, password: dto.password };
    // This is a placeholder, as your DTO requires firebaseUid.
    // This endpoint may need to be re-evaluated or have its DTO adjusted.
    const registerPayload: RegisterDto = {
      ...dto,
      firebaseUid: 'placeholder-uid-for-deliverer', // You need a strategy for this
      roles: [UserRole.DELIVERER],
    };
    
    await this.authService.register(registerPayload);
    const { access_token, user } = await this.authService.login(loginDto);
    
    return {
      accessToken: access_token,
      user: plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    };
  }

  @Post('login-deliverer')
  @HttpCode(HttpStatus.OK)
  async loginDeliverer(@Body() dto: LoginDto) {
    const { access_token, user } = await this.authService.login(dto);
    if (!user.roles.includes(UserRole.DELIVERER)) {
      throw new UnauthorizedException('Access denied. Not a deliverer account.');
    }
    return {
      accessToken: access_token,
      user: plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    };
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleLogin(@Body() dto: GoogleAuthDto) {
    const { access_token, refreshToken, user } = await this.authService.googleLogin(dto);
    return {
      accessToken: access_token,
      refreshToken,
      user: plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() dto: RefreshTokenDto) {
    const { access_token, refreshToken, user } = await this.authService.refreshToken(dto.refreshToken);
    return {
      accessToken: access_token,
      refreshToken,
      user: plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    };
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Request() req: AuthenticatedRequest) {
    // The user object is attached to the request by the JwtStrategy
    return plainToInstance(UserResponseDto, req.user, { excludeExtraneousValues: true });
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}