import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ChurnRecoveryService } from '../users/churn-recovery.service';
import {
  RegisterDeviceTokenDto,
  UnregisterDeviceTokenDto,
} from './dto/register-device-token.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly churnRecoveryService: ChurnRecoveryService,
  ) {}

  @Post('remind-renewal/:userId')
  @HttpCode(HttpStatus.OK)
  async remindRenewal(@Param('userId', ParseIntPipe) userId: number) {
    await this.churnRecoveryService.remindRenewal(userId);
    return { message: 'Reminder sent successfully' };
  }

  @Post('register-device')
  @HttpCode(HttpStatus.OK)
  async registerDevice(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException(
        'Authentication required to register device token.',
      );
    }
    return this.notificationsService.registerDeviceToken({
      userId,
      token: dto.token,
      platform: dto.platform,
    });
  }

  @Post('unregister-device')
  @HttpCode(HttpStatus.OK)
  async unregisterDevice(@Body() dto: UnregisterDeviceTokenDto) {
    return this.notificationsService.unregisterDeviceToken(dto.token);
  }
}
