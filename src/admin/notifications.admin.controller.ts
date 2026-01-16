import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Query,
  Param,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Controller('admin/notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getHistory(
    @Query('page') pageRaw: number | string = 1,
    @Query('limit') limitRaw: number | string = 20,
  ) {
    const page = Number(pageRaw) || 1;
    const limit = Number(limitRaw) || 20;
    return this.notificationsService.findAll({ page, limit });
  }

  @Post('send-user')
  async sendToUser(
    @Body()
    dto: {
      userId: number;
      title: string;
      body: string;
      type: NotificationType;
      data?: any;
    },
  ) {
    return this.notificationsService.createAndDispatch(dto);
  }

  @Post('broadcast')
  async broadcast(
    @Body()
    dto: {
      role: UserRole;
      title: string;
      body: string;
      type?: NotificationType;
      data?: any;
    },
  ) {
    return this.notificationsService.broadcastToRole(dto);
  }
}
