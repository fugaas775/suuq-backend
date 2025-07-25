import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards, ParseIntPipe, Req } from '@nestjs/common';
import { WithdrawalsService } from './withdrawals.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { WithdrawalStatus } from './entities/withdrawal.entity';

@UseGuards(RolesGuard)
@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Roles(UserRole.VENDOR)
  @Get('balance')
  async getBalance(@Req() req) {
    return { balance: await this.withdrawalsService.calculateVendorBalance(req.user.id) };
  }

  @Roles(UserRole.VENDOR)
  @Get()
  async getWithdrawals(@Req() req) {
    return this.withdrawalsService.getWithdrawalsForVendor(req.user.id);
  }

  @Roles(UserRole.VENDOR)
  @Post('request')
  async requestWithdrawal(@Req() req, @Body('amount') amount: number) {
    return this.withdrawalsService.requestWithdrawal(req.user.id, amount);
  }
}
