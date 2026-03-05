import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  Res,
  Header,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { WithdrawalsService } from './withdrawals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { WithdrawalStatus } from './entities/withdrawal.entity';
import { RateLimitInterceptor } from '../common/interceptors/rate-limit.interceptor';
import { ApproveWithdrawalResponseDto } from './dto/approve-withdrawal-response.dto';
import { RejectWithdrawalResponseDto } from './dto/reject-withdrawal-response.dto';
import { WithdrawalResponseDto } from './dto/withdrawal-response.dto';

@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  private mapWithdrawalToResponseDto(withdrawal: any): WithdrawalResponseDto {
    const providerReference =
      withdrawal?.details?.disbursementReference || null;

    return {
      id: withdrawal.id,
      user: withdrawal.user
        ? {
            id: withdrawal.user.id,
            displayName: withdrawal.user.displayName ?? null,
            storeName: withdrawal.user.storeName ?? null,
            email: withdrawal.user.email ?? null,
            walletBalance:
              typeof withdrawal.user.walletBalance === 'number'
                ? withdrawal.user.walletBalance
                : null,
          }
        : undefined,
      amount: withdrawal.amount,
      method: withdrawal.method,
      details: withdrawal.details,
      status: withdrawal.status,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
      providerReference,
    };
  }

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
  @UseInterceptors(
    new RateLimitInterceptor({
      maxRps: 4,
      burst: 8,
      keyBy: 'userOrIp',
      scope: 'route',
      headers: true,
    }),
  )
  @Header('Cache-Control', 'private, max-age=10')
  async getMyWithdrawals(@Req() req: any) {
    return this.withdrawalsService.findAll({ userId: req.user.id });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/list')
  @UseInterceptors(
    new RateLimitInterceptor({
      maxRps: 6,
      burst: 12,
      keyBy: 'userOrIp',
      scope: 'route',
      headers: true,
    }),
  )
  @ApiOkResponse({ type: WithdrawalResponseDto, isArray: true })
  async getAllWithdrawals(
    @Query('status') status: WithdrawalStatus | undefined,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WithdrawalResponseDto[]> {
    const { items, total } = await this.withdrawalsService.findAll({
      status,
      page,
      limit,
    });
    res.header('X-Total-Count', total.toString());
    return items.map((item) => this.mapWithdrawalToResponseDto(item));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Delete('admin/bulk')
  async deleteWithdrawals(@Body('ids') ids: number[]) {
    return this.withdrawalsService.deleteWithdrawals(ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @Delete('admin/:id')
  async deleteWithdrawal(@Param('id', ParseIntPipe) id: number) {
    return this.withdrawalsService.deleteWithdrawal(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch(':id/approve')
  @ApiOkResponse({ type: ApproveWithdrawalResponseDto })
  async approveWithdrawal(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ApproveWithdrawalResponseDto> {
    const withdrawal = await this.withdrawalsService.approveWithdrawal(id);
    return this.mapWithdrawalToResponseDto(
      withdrawal,
    ) as ApproveWithdrawalResponseDto;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch(':id/reject')
  @ApiOkResponse({ type: RejectWithdrawalResponseDto })
  async rejectWithdrawal(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason?: string,
  ): Promise<RejectWithdrawalResponseDto> {
    const withdrawal = await this.withdrawalsService.rejectWithdrawal(
      id,
      reason,
    );
    return this.mapWithdrawalToResponseDto(
      withdrawal,
    ) as RejectWithdrawalResponseDto;
  }
}
