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
    // Fetch base price
    const basePriceSetting = await this.uiSettingRepo.findOne({
      where: { key: 'vendor_subscription_base_price' },
    });
    const basePrice = basePriceSetting ? Number(basePriceSetting.value) : 9.99;

    // Fetch rates
    const ratesSnapshot = this.currencyService.getRatesSnapshot();
    const rates = ratesSnapshot.rates;

    // Calculate localized prices
    const prices: Record<string, number> = {
      USD: basePrice,
    };

    for (const [currency, rate] of Object.entries(rates)) {
      if (currency !== 'USD') {
        prices[currency] = Math.round(basePrice * Number(rate) * 100) / 100;
      }
    }

    return {
      prices,
      renewalType: 'WALLET_AUTO',
    };
  }
}
