import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PayoutDto } from './dto/payout.dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async getWallet(@Req() req) {
    const wallet = await this.walletService.getWallet(req.user.userId);
    const transactions = await this.walletService.getTransactions(req.user.userId);
    return {
      balance: wallet.balance,
      currency: wallet.currency,
      transactions,
    };
  }

  @Post('payout')
  async requestPayout(@Req() req, @Body() payoutDto: PayoutDto) {
    return this.walletService.requestPayout(req.user.userId, payoutDto.amount);
  }
}
