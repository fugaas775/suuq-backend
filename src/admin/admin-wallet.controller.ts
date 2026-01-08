import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { WalletService } from '../wallet/wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { TopUpStatus } from '../wallet/entities/top-up-request.entity';
import { TransactionType } from '../wallet/entities/wallet-transaction.entity';

@Controller('admin/wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post(':id/recalculate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async recalculateWallet(@Param('id', ParseIntPipe) id: number) {
    const wallet = await this.walletService.getWallet(id); // id is userId here
    await this.walletService.recalculateBalance(wallet.id);
    return {
      success: true,
      message: 'Wallet balance recalculated',
      balance: wallet.balance,
      currency: wallet.currency,
    };
  }

  @Post(':id/sync-currency')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async syncCurrency(@Param('id', ParseIntPipe) id: number) {
    const wallet = await this.walletService.syncWalletCurrency(id);
    return {
      success: true,
      message: 'Wallet currency synced',
      balance: wallet.balance,
      currency: wallet.currency,
    };
  }

  @Delete('transactions/bulk')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async bulkDeleteTransactions(@Body() body: { ids: number[] }) {
    return this.walletService.bulkDeleteTransactions(body.ids);
  }

  @Delete('transactions/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteTransaction(@Param('id', ParseIntPipe) id: number) {
    return this.walletService.deleteTransaction(id);
  }

  @Get('top-ups')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listTopUpRequests(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status?: TopUpStatus,
  ) {
    return this.walletService.findAllTopUpRequests(page, limit, status);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getWalletStats() {
    return this.walletService.getWalletStats();
  }

  @Get('transactions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listTransactions(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('type') type?: string,
    @Query('orderId') orderId?: number,
    @Query('userId') userId?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Map frontend types to backend enum
    if (type === 'PURCHASE') type = TransactionType.PAYMENT;
    if (type === 'SUBSCRIPTION_EXTENSION') type = TransactionType.SUBSCRIPTION;

    // Validate type against enum if provided
    let validType: TransactionType | undefined;
    if (
      type &&
      Object.values(TransactionType).includes(type as TransactionType)
    ) {
      validType = type as TransactionType;
    }

    return this.walletService.findAllTransactions(
      page,
      limit,
      validType,
      orderId,
      userId,
      startDate,
      endDate,
    );
  }
}
