import {
  Controller, Post, Get, Body, Request, UseGuards, HttpCode, HttpStatus, UnauthorizedException, Patch, Put,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard'; 
import { UserResponseDto } from '../users/dto/user-response.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { plainToInstance } from 'class-transformer';
import { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    const { accessToken, refreshToken } = await this.authService.login({ email: user.email, password: dto.password });
    return {
      accessToken,
      refreshToken,
      user: plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    const { accessToken, refreshToken, user } = await this.authService.login(dto);
    return {
      accessToken,
      refreshToken,
      user: plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    };
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleLogin(@Body() dto: GoogleAuthDto) {
    const { accessToken, refreshToken, user } = await this.authService.googleLogin(dto);
    return {
      accessToken,
      refreshToken,
      user: plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() dto: RefreshTokenDto) {
    const { accessToken, refreshToken, user } = await this.authService.refreshToken(dto.refreshToken);
    return {
      accessToken,
      refreshToken,
      user: plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: AuthenticatedRequest) {
    // Fetch the full user from the database to ensure all fields are present
    const user = await this.authService.getUsersService().findById(req.user.id);
    return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
  }

  // Allow PATCH/PUT /api/auth/profile as client fallbacks to update current user
  @Patch('profile')
  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateOwnProfileViaAuth(@Request() req: AuthenticatedRequest, @Body() data: UpdateUserDto) {
    const usersService = this.authService.getUsersService();
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();

    // Sanitize: customers shouldn't modify roles/email/password; keep server-side enforcement minimal here
    delete data.roles;
    delete data.email;
    delete data.password;

    const user = await usersService.update(userId, data);
    return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
  }

  // Change password for the current user
  @Patch('password')
  @Put('password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Request() req: AuthenticatedRequest, @Body() body: ChangePasswordDto) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    const current = body.resolveCurrent();
    const next = body.resolveNext();
    if (!next) throw new Error('New password is required.');
    await this.authService.changePassword(userId, current, next);
    return { success: true };
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

  @Get('verify')
  @UseGuards(JwtAuthGuard)
  verify(@Request() req: AuthenticatedRequest) {
    return plainToInstance(UserResponseDto, req.user, { excludeExtraneousValues: true });
  }
}