import {
  Controller,
  Get,
  Put,
  Patch,
  Body,
  UseGuards,
  Request as ReqDecorator,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(private readonly settingsService: SettingsService) {}

  @Get('profile')
  async getProfile(@ReqDecorator() req: any) {
    try {
      return await this.settingsService.getUserSettings(req.user.id);
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error('Error in getProfile:', err.stack || err.message);
      } else {
        this.logger.error('Error in getProfile:', String(err));
      }
      throw err;
    }
  }

  @Put('profile')
  @Patch('profile')
  async updateProfile(
    @ReqDecorator() req: any,
    @Body() updateDto: UpdateSettingsDto,
  ) {
    try {
      return await this.settingsService.updateUserSettings(req.user.id, updateDto);
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error('Error in updateProfile:', err.stack || err.message);
      } else {
        this.logger.error('Error in updateProfile:', String(err));
      }
      throw err;
    }
  }
}