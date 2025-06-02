import {
  Controller,
  Post,
  Get,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register-deliverer')
  async registerDeliverer(@Body() dto: RegisterDto) {
    return this.authService.register({ ...dto, role: 'DELIVERER' });
  }

  @Post('login-deliverer')
  async loginDeliverer(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('vendor-dashboard')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('VENDOR')
  getVendorDashboard(@Request() req: any) {
    return {
      message: 'Welcome vendor',
      user: req.user,
    };
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Request() req: any) {
    return req.user; // 🔁 returns { id, email, role } from validated JWT
  }
}
