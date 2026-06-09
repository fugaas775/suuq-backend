import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { ApplyEquityPartnerDto } from './dto/equity-partner.dto';
import { EquityPartnerService, EQUITY_PRICING } from './equity-partner.service';

@ApiTags('Seller Equity')
@Controller('seller/v1/equity')
@UseGuards(JwtAuthGuard)
export class SellerEquityController {
  constructor(private readonly equityService: EquityPartnerService) {}

  /** Apply for the equity partner program. */
  @Post('apply')
  apply(@Req() req: AuthenticatedRequest, @Body() dto: ApplyEquityPartnerDto) {
    return this.equityService.applyForPartnership(req.user.id, dto);
  }

  /** Return the current user's equity partner profile (all statuses). */
  @Get('profile')
  async getProfile(@Req() req: AuthenticatedRequest) {
    const profile = await this.equityService.getSellerProfile(req.user.id);
    if (!profile)
      throw new NotFoundException('No equity partner application found.');
    return profile;
  }

  /** Return dashboard data (referral code, assignments, payout summary). */
  @Get('dashboard')
  getDashboard(@Req() req: AuthenticatedRequest) {
    return this.equityService.getSellerDashboard(req.user.id);
  }

  /** Pricing constants for the dashboard copy ("Earn 950 ETB / month / branch"). */
  @Get('pricing')
  getPricing() {
    return EQUITY_PRICING;
  }
}
