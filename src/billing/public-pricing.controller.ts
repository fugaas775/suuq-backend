import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { POS_BRANCH_SUBSCRIPTION_OPTIONS } from '../branch-staff/pos-workspace-pricing';
import { SUBSCRIPTION_PAYMENT_DESTINATIONS } from '../subscription-payments/payment-destinations';
import { SUPPLIER_SUBSCRIPTION_OPTIONS } from '../suppliers/supplier-subscription-pricing';

/**
 * The subscription price list, readable without a session.
 *
 * Prices are public — they are shown on the sign-in gate before anyone has an
 * account — and every pay screen used to carry its own copy of them, which is
 * how a displayed price and a charged price drifted apart more than once. This
 * is the one list; screens read it and keep a local copy only as a fallback.
 */
@ApiTags('Pricing')
@Controller('pos-portal/pricing')
export class PublicPricingController {
  @Get()
  getPricing() {
    const describe = (option: {
      period: string;
      months: number;
      amount: number;
      currency: string;
      label: string;
      planCode: string;
    }) => ({
      period: option.period,
      months: option.months,
      amount: option.amount,
      currency: option.currency,
      label: option.label,
      planCode: option.planCode,
    });
    return {
      // The only places a subscription is paid to. Screens print these and
      // nothing else.
      payTo: SUBSCRIPTION_PAYMENT_DESTINATIONS.map((entry) => ({ ...entry })),
      posBranch: POS_BRANCH_SUBSCRIPTION_OPTIONS.map(describe),
      supplier: SUPPLIER_SUBSCRIPTION_OPTIONS.map(describe),
    };
  }
}
