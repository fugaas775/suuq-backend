import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { WithdrawalsService } from './withdrawals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { WithdrawalStatus } from './entities/withdrawal.entity';

@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Get('payout-method')
  getPayoutMethods(@Query('currency') currency?: string) {
    return this.withdrawalsService.getPayoutMethods(currency);
  }

  @UseGuards(JwtAuthGuard)
  @Post('request')
  async requestWithdrawal(
    @Req() req: any,
    @Body() body: { amount: number; method: string; details: any },
  ) {
    return this.withdrawalsService.requestWithdrawal(
      req.user,
      body.amount,
      body.method,
      body.details,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getMyWithdrawals(@Req() req: any) {
    return this.withdrawalsService.findAll({ userId: req.user.id });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/list')
  async getAllWithdrawals(
    @Query('status') status: WithdrawalStatus | undefined,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.withdrawalsService.findAll({ status, page, limit });
    res.header('X-Total-Count', total.toString());
    return items;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch(':id/approve')
  async approveWithdrawal(@Param('id', ParseIntPipe) id: number) {
    return this.withdrawalsService.approveWithdrawal(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch(':id/reject')
  async rejectWithdrawal(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason?: string,
  ) {
    return this.withdrawalsService.rejectWithdrawal(id, reason);
  }
}
