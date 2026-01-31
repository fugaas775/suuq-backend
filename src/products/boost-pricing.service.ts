import { Injectable } from '@nestjs/common';
import { CurrencyService } from '../common/services/currency.service';

export type BoostTier = 'starter' | 'popular' | 'best_value';

export interface BoostOption {
  tier: BoostTier;
  durationDays: number;
  basePriceETB: number;
}

export interface BoostPriceResult {
  tier: BoostTier;
  durationDays: number;
  price: number;
  currency: string;
}

export const BOOST_OPTIONS: BoostOption[] = [
  { tier: 'starter', durationDays: 1, basePriceETB: 50 },
  { tier: 'popular', durationDays: 3, basePriceETB: 120 },
  { tier: 'best_value', durationDays: 7, basePriceETB: 250 },
];

@Injectable()
export class BoostPricingService {
  constructor(private readonly currencyService: CurrencyService) {}

  getBoostPricesForCountry(targetCurrency: string): BoostPriceResult[] {
    return BOOST_OPTIONS.map((opt) => {
      const price = this.currencyService.convert(
        opt.basePriceETB,
        'ETB',
        targetCurrency,
      );
      return {
        tier: opt.tier,
        durationDays: opt.durationDays,
        price,
        currency: targetCurrency,
      };
    });
  }
}
