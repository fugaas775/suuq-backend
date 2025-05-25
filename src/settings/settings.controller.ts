import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Request as ReqDecorator,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('profile')
  getProfile(@ReqDecorator() req: any) {
    return this.settingsService.getUserSettings(req.user.id);
  }

  @Put('profile')
  updateProfile(
    @ReqDecorator() req: any,
    @Body() updateDto: UpdateSettingsDto,
  ) {
    return this.settingsService.updateUserSettings(req.user.id, updateDto);
  }
}
