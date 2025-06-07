import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  create(@Body() body: { title: string; message: string }) {
    return this.notificationsService.create(body.title, body.message);
  }

  @Get()
  findAll() {
    return this.notificationsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.notificationsService.remove(id);
  }

  // Public (for CUSTOMER and VENDOR roles)
  @Get('public')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.CUSTOMER, UserRole.VENDOR)
  getPublicNotifications() {
    return this.notificationsService.findAll();
  }
}