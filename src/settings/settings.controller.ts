import {
  Controller,
  Get,
  Put,
  Patch, // <-- Add this import
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
  async getProfile(@ReqDecorator() req: any) {
    try {
      return await this.settingsService.getUserSettings(req.user.id);
    } catch (err) {
      // Optionally log the error for debugging
      console.error('Error in getProfile:', err);
      throw err;
    }
  }

  @Put('profile')
  @Patch('profile') // <-- Add this decorator to support PATCH as well
  async updateProfile(
    @ReqDecorator() req: any,
    @Body() updateDto: UpdateSettingsDto,
  ) {
    try {
      return await this.settingsService.updateUserSettings(req.user.id, updateDto);
    } catch (err) {
      // Optionally log the error for debugging
      console.error('Error in updateProfile:', err);
      throw err;
    }
  }
}
