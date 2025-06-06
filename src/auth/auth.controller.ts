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
import { UserRole } from '../users/user.entity';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto'; // <-- Add this import

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

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const result = await this.authService.register(dto);
    return {
      message: result.message,
      user: plainToInstance(UserResponseDto, result.user, { excludeExtraneousValues: true }),
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

  @Post('register-deliverer')
  async registerDeliverer(@Body() dto: Omit<RegisterDto, 'role' | 'roles'>) {
    const registerPayload: RegisterDto = {
      ...dto,
      roles: [UserRole.DELIVERER],
    };
    const { user } = await this.authService.register(registerPayload);
    return {
      message: 'Deliverer registration successful',
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
      access_token,
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

  @Get('vendor-dashboard')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR)
  getVendorDashboard(@Request() req: AuthenticatedRequest) {
    return {
      message: 'Welcome vendor',
      user: plainToInstance(UserResponseDto, req.user, { excludeExtraneousValues: true }),
    };
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Request() req: AuthenticatedRequest) {
    return plainToInstance(UserResponseDto, req.user, { excludeExtraneousValues: true });
  }
}
