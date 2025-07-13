import { Injectable } from '@nestjs/common';

@Injectable()
export class CurrencyService {
  // Exchange rates relative to USD
  private readonly rates: Record<string, number> = {
    USD: 1,
    KES: 130.5,
    ETB: 57.2,
    // Add more as needed
  };

  /**
   * Converts an amount from one currency to another using USD as the base.
   * @param amount The amount to convert
   * @param fromCurrency The source currency (e.g., 'ETB')
   * @param toCurrency The target currency (e.g., 'KES')
   * @returns The converted amount
   */
  convert(amount: number, fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) return amount;
    const fromRate = this.rates[fromCurrency];
    const toRate = this.rates[toCurrency];
    if (!fromRate || !toRate) {
      throw new Error(`Unsupported currency: ${fromCurrency} or ${toCurrency}`);
    }
    // Convert to USD first, then to target
    const amountInUSD = amount / fromRate;
    const converted = amountInUSD * toRate;
    return Math.round(converted * 100) / 100; // round to 2 decimals
  }
}
