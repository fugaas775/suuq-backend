import {
  Controller,
  Get,
  Query,
  UseGuards,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { WalletService } from '../wallet/wallet.service';
import { TopUpStatus } from '../wallet/entities/top-up-request.entity';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Controller('admin/wallet')
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

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

  @Get('transactions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listTransactions(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.walletService.findAllTransactions(page, limit);
  }
}
