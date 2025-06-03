import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { DeviceTokenService } from './device-token.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithUser } from '../types/request';

@Controller('device-token')
@UseGuards(JwtAuthGuard)
export class DeviceTokenController {
  constructor(private deviceTokenService: DeviceTokenService) {}

  @Post()
  async register(@Body('token') token: string, @Req() req: RequestWithUser) {
    return this.deviceTokenService.registerToken(req.user, token);
  }
}
