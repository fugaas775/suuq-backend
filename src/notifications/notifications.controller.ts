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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../constants/roles'; // Import role enum

@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() body: { title: string; message: string }) {
    return this.notificationsService.create(body.title, body.message);
  }

  @Get()
  @Roles(UserRole.ADMIN)
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

  @Get('/public')
  @UseGuards(AuthGuard('jwt'))
  @Roles(UserRole.CUSTOMER, UserRole.VENDOR)
  getPublicNotifications() {
   return this.notificationsService.findAll();
  }
}
