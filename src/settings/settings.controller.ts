// In src/settings/settings.controller.ts

import {
  Controller,
  Get,
  Put,
  Patch,
  Body,
  UseGuards,
  Request as ReqDecorator,
  Logger,
  Param,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

// ✨ FIX: Remove @UseGuards from the controller level
@Controller('settings')
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(private readonly settingsService: SettingsService) {}

  // ✨ FIX: Add @UseGuards ONLY to the routes that need it
  @UseGuards(JwtAuthGuard)
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

  // ✨ FIX: Add @UseGuards ONLY to the routes that need it
  @UseGuards(JwtAuthGuard)
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

  // This endpoint is now correctly PUBLIC
  @Get('ui-settings')
  @Get() // Also handle the root /settings endpoint
  async getAll() {
    return this.settingsService.getAllSettings();
  }
  
  // This endpoint for updating should be protected for admins
  // You would typically add an Admin role guard here
  @UseGuards(JwtAuthGuard) 
  @Patch('ui-settings/:key')
  async updateSetting(@Param('key') key: string, @Body('value') value: any) {
    const updated = await this.settingsService.updateSetting(key, value);
    if (!updated) {
      return { error: 'Setting not found' };
    }
    return updated;
  }
}