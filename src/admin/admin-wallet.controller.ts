import {
  Controller,
  Post,
  Put,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Header,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { WalletService } from '../wallet/wallet.service';
import { OrdersService } from '../orders/orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { PayoutStatus } from '../wallet/entities/payout-log.entity';
import { AdminWalletAutoPayoutExportQueryDto } from './dto/admin-wallet-auto-payout-export-query.dto';
import { AdminWalletPageQueryDto } from './dto/admin-wallet-page-query.dto';
import { AdminWalletPayoutQueryDto } from './dto/admin-wallet-payout-query.dto';
import { AdminWalletTopUpQueryDto } from './dto/admin-wallet-top-up-query.dto';
import { AdminWalletTransactionsQueryDto } from './dto/admin-wallet-transactions-query.dto';

@Controller('admin/wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminWalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly ordersService: OrdersService,
  ) {}

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
  @Roles(UserRole.SUPER_ADMIN)
  async bulkDeleteTransactions(@Body() body: { ids: number[] }) {
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      throw new BadRequestException('ids array is required');
    }
    return this.walletService.bulkDeleteTransactions(body.ids);
  }

  @Delete('transactions/:id')
  @Roles(UserRole.SUPER_ADMIN)
  async deleteTransaction(@Param('id', ParseIntPipe) id: number) {
    return this.walletService.deleteTransaction(id);
  }

  @Get('top-ups')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listTopUpRequests(@Query() query: AdminWalletTopUpQueryDto) {
    return this.walletService.findAllTopUpRequests(
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
    );
  }

  @Get('payouts')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listPayouts(@Query() query: AdminWalletPayoutQueryDto) {
    return this.walletService.getAllPayouts(
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
    );
  }

  @Get('payouts/export')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="pending_payouts.csv"')
  async exportPayouts() {
    return this.walletService.exportPendingPayouts();
  }

  @Get('payouts/auto-failures')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listAutoPayoutFailures(@Query() query: AdminWalletPageQueryDto) {
    return this.walletService.getFailedAutoEbirrPayouts(
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('payouts/exceptions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listPayoutExceptions(@Query() query: AdminWalletPageQueryDto) {
    return this.walletService.getReconcileRequiredPayoutExceptions(
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('payouts/auto-failures/export')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Header('Content-Type', 'text/csv')
  @Header(
    'Content-Disposition',
    'attachment; filename="failed_auto_ebirr_payouts.csv"',
  )
  async exportAutoPayoutFailures(
    @Query() query: AdminWalletAutoPayoutExportQueryDto,
  ) {
    return this.walletService.exportFailedAutoEbirrPayouts(
      query.from,
      query.to,
    );
  }

  @Post('payouts/:id/retry-auto')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async retryAutoPayout(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.retryFailedAutoPayout(id);
  }

  @Post('payouts/:id/reconcile-exception')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reconcilePayoutException(@Param('id', ParseIntPipe) id: number) {
    const payout = await this.walletService.getPayoutById(id);

    if (payout.status === PayoutStatus.FAILED) {
      return this.ordersService.retryFailedAutoPayout(id);
    }

    return this.walletService.reconcilePayoutDebitException(id);
  }

  @Put('payouts/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updatePayout(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: PayoutStatus,
    @Body('reference') reference?: string,
  ) {
    if (!Object.values(PayoutStatus).includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    return this.walletService.updatePayoutStatus(id, status, reference);
  }

  @Delete('payouts/:id')
  @Roles(UserRole.SUPER_ADMIN)
  async deletePayout(@Param('id', ParseIntPipe) id: number) {
    await this.walletService.deletePayout(id);
    return { deleted: 1 };
  }

  @Delete('payouts')
  @Roles(UserRole.SUPER_ADMIN)
  async deletePayouts(@Body('ids') ids: number[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('ids array is required');
    }
    const deleted = await this.walletService.deletePayouts(ids);
    return { deleted };
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getWalletStats() {
    return this.walletService.getWalletStats();
  }

  @Get('transactions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listTransactions(@Query() query: AdminWalletTransactionsQueryDto) {
    return this.walletService.findAllTransactions(
      query.page ?? 1,
      query.limit ?? 20,
      query.type,
      query.orderId,
      query.userId,
      query.startDate,
      query.endDate,
    );
  }
}
