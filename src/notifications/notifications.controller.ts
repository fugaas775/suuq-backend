import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('register-device')
  async registerDevice(@Req() req: any, @Body() dto: RegisterDeviceTokenDto) {
    // Prefer the authenticated user's id; fall back to body for backward compatibility
    const userId = req.user?.id ?? dto.userId;
    return this.notificationsService.registerDeviceToken({
      userId,
      token: dto.token,
      platform: dto.platform,
    });
  }
}
