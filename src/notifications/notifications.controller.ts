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
  Get,
  Patch,
  Query,
  DefaultValuePipe,
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

  @Get()
  async getNotifications(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    if (!req.user?.id) throw new UnauthorizedException();
    return this.notificationsService.findAllForUser(req.user.id, page, limit);
  }

  @Patch('read-all')
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    if (!req.user?.id) throw new UnauthorizedException();
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  @Patch(':id/read')
  async markAsRead(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    if (!req.user?.id) throw new UnauthorizedException();
    return this.notificationsService.markAsRead(id, req.user.id);
  }

  @Post('remind-renewal/:userId')
  @HttpCode(HttpStatus.OK)
  async remindRenewal(@Param('userId', ParseIntPipe) userId: number) {
    const result = await this.churnRecoveryService.remindRenewal(userId);
    if (!result.sent) {
        return { message: result.reason || 'Reminder not sent' };
    }
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
