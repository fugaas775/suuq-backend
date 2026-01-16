import { Controller, Get } from '@nestjs/common';
import { CurrencyService } from '../common/services/currency.service';
import { InjectRepository } from '@nestjs/typeorm';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { Repository } from 'typeorm';

@Controller('v1/subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly currencyService: CurrencyService,
    @InjectRepository(UiSetting)
    private readonly uiSettingRepo: Repository<UiSetting>,
  ) {}

  @Get('plans')
  async getPlans() {
    // Deprecated: No more paid subscriptions.
    // Returning 0 prices to signal "Free" or "All Commission" model to legacy clients.
    return {
      prices: {
        USD: 0,
        ETB: 0,
        KES: 0,
        SOS: 0,
        DJF: 0,
      },
      renewalType: 'NONE',
      message: 'Subscriptions are now free. Commission applies per order.',
    };
  }
}
