import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { MarketingLeadsService } from '../marketing-leads/marketing-leads.service';
import { AdminMarketingLeadsQueryDto } from './dto/admin-marketing-leads-query.dto';

@Controller('admin/marketing-leads')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminMarketingLeadsController {
  constructor(private readonly marketingLeadsService: MarketingLeadsService) {}

  @Get()
  async list(@Query() query: AdminMarketingLeadsQueryDto) {
    return this.marketingLeadsService.listRecentLeads({
      limit: query.limit ?? 20,
      type: query.type,
      search: query.search,
    });
  }
}
