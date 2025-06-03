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
    const { access_token, user } = await this.authService.login(dto);
    return {
      access_token,
      user: plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    };
  }

  @Post('register-deliverer')
  async registerDeliverer(@Body() dto: Omit<RegisterDto, 'role' | 'roles'>) {
    const registerPayload: RegisterDto = {
      ...dto,
      roles: [UserRole.DELIVERER], // Use enum member
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
    if (!user.roles.includes(UserRole.DELIVERER)) { // Use enum member
        throw new UnauthorizedException('Access denied. Not a deliverer account.');
    }
    return {
      access_token,
      user: plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true }),
    };
  }

  @Get('vendor-dashboard')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.VENDOR) // Use enum member
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
