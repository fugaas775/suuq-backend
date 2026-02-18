import { Controller, Post, Body, Get, Req, UseGuards } from '@nestjs/common';
import { CreditService } from './credit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';

@Controller('credit')
@UseGuards(JwtAuthGuard)
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  @Get('limit')
  async getLimit(@Req() req: AuthenticatedRequest) {
    // req.user is populated by JwtAuthGuard
    return this.creditService.getLimit(req.user.id);
  }

  @Post('apply')
  async apply(@Req() req: AuthenticatedRequest) {
    return this.creditService.applyForCredit(req.user.id);
  }

  @Get('transactions')
  async getTransactions(@Req() req: AuthenticatedRequest) {
    return this.creditService.getTransactions(req.user.id);
  }
}
