import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  Patch,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { WithdrawalsService } from './withdrawals.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { WithdrawalStatus } from './entities/withdrawal.entity';
import { WithdrawalDto } from './dto/withdrawal.dto';
import { UserRole } from '../users/user.entity'; // <-- Import the enum

@Controller('withdrawals')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post('request')
  @Roles(UserRole.VENDOR)
  requestWithdrawal(@Body() body: WithdrawalDto, @Req() req: any) {
    return this.withdrawalsService.createWithdrawal(
      body.amount,
      body.mobileMoneyNumber,
      req.user.id,
    );
  }

  @Get('my')
  @Roles(UserRole.VENDOR)
  getVendorWithdrawals(@Req() req: any) {
    return this.withdrawalsService.getVendorWithdrawals(req.user.id);
  }

  @Get('all')
  @Roles(UserRole.ADMIN)
  getAllWithdrawals() {
    return this.withdrawalsService.getAll();
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: WithdrawalStatus,
  ) {
    return this.withdrawalsService.updateStatus(id, status);
  }

  @Get('vendor-stats')
  @Roles(UserRole.VENDOR)
  getVendorStats(@Req() req: any) {
   return this.withdrawalsService.getVendorStats(req.user.id);
  }
}
