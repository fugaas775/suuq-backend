import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateBankAccountsDto } from './dto/update-bank-accounts.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';

@Controller('config')
export class ConfigController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('bank-accounts')
  async getBankAccounts() {
    // Return empty object if setting not found, to avoid null client issues
    const setting = await this.settingsService.getSystemSetting('bank_accounts');
    return setting || {}; 
  }

  @Put('bank-accounts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateBankAccounts(@Body() dto: UpdateBankAccountsDto) {
    // Filter out empty country entries
    const cleanDto: Record<string, any> = {};
    const countries = ['Ethiopia', 'Kenya', 'Somalia', 'Djibouti'] as const;

    for (const country of countries) {
      const details = dto[country];
      // Only keep if details exist and at least one field has a value
      if (details && (details.bank || details.accountName || details.accountNumber)) {
        cleanDto[country] = details;
      }
    }

    return this.settingsService.setSystemSetting(
      'bank_accounts', 
      cleanDto, 
      'Bank Account Details for dynamic configuration in apps'
    );
  }
}
