import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Param,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { TopUpDto } from './dto/top-up.dto';
import { PaymentDto } from './dto/payment.dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async getWallet(@Req() req) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const userId = req.user?.id || req.user?.userId;
    const wallet = await this.walletService.getWallet(userId);
    const transactions = await this.walletService.getTransactions(userId);
    return {
      balance: wallet.balance,
      currency: wallet.currency,
      transactions,
    };
  }

  @Get('balance')
  async getBalance(@Req() req) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const userId = req.user?.id || req.user?.userId;
    const wallet = await this.walletService.getWallet(userId);
    return {
      balance: wallet.balance,
      currency: wallet.currency,
    };
  }

  @Get('transactions')
  async getTransactions(@Req() req) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const userId = req.user?.id || req.user?.userId;
    return this.walletService.getTransactions(userId);
  }

  @Post('top-up')
  async requestTopUp(@Req() req, @Body() topUpDto: TopUpDto) {
    // Fix: Use req.user.id (from JwtStrategy) instead of req.user.userId
    // Also log the user object to debug
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.log('TopUp Request User:', req.user);
    console.log('TopUp Body UserDetails:', topUpDto.userDetails);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const tokenUserId = req.user?.id || req.user?.userId;
    const bodyUserId = topUpDto.userDetails?.id
      ? Number(topUpDto.userDetails.id)
      : undefined;

    // Prioritize token user ID to prevent ID spoofing/mismatch
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const userId = tokenUserId || bodyUserId;

    if (!userId) {
      throw new Error('User ID could not be resolved from token or body');
    }

    return this.walletService.requestTopUp(
      userId,
      topUpDto.amount,
      topUpDto.method,
      topUpDto.reference,
    );
  }

  @Post('pay')
  async payWithWallet(@Req() req, @Body() paymentDto: PaymentDto) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const userId = req.user?.id || req.user?.userId;
    return this.walletService.payWithWallet(
      userId,
      paymentDto.amount,
      paymentDto.description,
    );
  }

  @Post('top-up/:id/approve')
  @Roles(UserRole.ADMIN)
  async approveTopUp(@Param('id') id: number) {
    return this.walletService.approveTopUp(id);
  }
}
