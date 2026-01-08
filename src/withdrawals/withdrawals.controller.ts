import { Controller, Get, Query } from '@nestjs/common';
import { WithdrawalsService } from './withdrawals.service';

@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Get('payout-method')
  // @UseGuards(JwtAuthGuard) // Optional: depending on if it needs auth
  getPayoutMethods(@Query('currency') currency?: string) {
    return this.withdrawalsService.getPayoutMethods(currency);
  }
}
