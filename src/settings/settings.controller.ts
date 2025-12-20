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
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { UpdateUiSettingDto } from './dto/update-ui-setting.dto';
import { AuthenticatedRequest } from '../auth/auth.types';

// ✨ FIX: Remove @UseGuards from the controller level
@Controller('settings')
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(private readonly settingsService: SettingsService) {}

  // ✨ FIX: Add @UseGuards ONLY to the routes that need it
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@ReqDecorator() req: AuthenticatedRequest) {
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
    @ReqDecorator() req: AuthenticatedRequest,
    @Body() updateDto: UpdateSettingsDto,
  ) {
    try {
      return await this.settingsService.updateUserSettings(
        req.user.id,
        updateDto,
      );
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
  async getUiSettings() {
    return this.settingsService.getAllSettings();
  }

  // Explicit root handler for /api/settings
  @Get()
  async getAllRoot() {
    return this.settingsService.getAllSettings();
  }

  // Admin-only update for UI settings
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch('ui-settings/:key')
  async updateSetting(
    @Param('key') key: string,
    @Body() body: UpdateUiSettingDto,
  ) {
    if (body.key && body.key !== key) {
      throw new ForbiddenException('Key in body must match path parameter');
    }
    const payload = { ...body, key };
    return this.settingsService.updateSetting(payload);
  }
}
