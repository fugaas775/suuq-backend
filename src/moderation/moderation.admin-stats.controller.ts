import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserReport } from './entities/user-report.entity';
import { Repository } from 'typeorm';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';

@Controller('admin/moderation')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class ModerationAdminStatsController {
  constructor(
    @InjectRepository(UserReport)
    private readonly reportRepo: Repository<UserReport>,
  ) {}

  @Get('stats')
  async getStats() {
    const total = await this.reportRepo.count();
    const pending = await this.reportRepo.count({
      where: { status: 'pending' },
    });
    const reviewed = await this.reportRepo.count({
      where: { status: 'reviewed' },
    });
    const dismissed = await this.reportRepo.count({
      where: { status: 'dismissed' },
    });

    return {
      total,
      pending,
      reviewed,
      dismissed,
    };
  }

  @Get('metrics')
  getMetrics() {
    // Return basic metrics structure to prevent 404s
    return {
      dailyReports: [],
      responseTimes: [],
    };
  }
}
