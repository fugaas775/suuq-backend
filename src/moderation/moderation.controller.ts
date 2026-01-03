import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReportDto } from './dto/create-report.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { UserReport } from './entities/user-report.entity';
import { Repository } from 'typeorm';
import { AuthenticatedRequest } from '../auth/auth.types';

@Controller('moderation')
@UseGuards(JwtAuthGuard)
export class ModerationController {
  constructor(
    @InjectRepository(UserReport)
    private readonly reportRepo: Repository<UserReport>,
  ) {}

  @Post('reports')
  async createReport(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateReportDto,
  ) {
    const report = this.reportRepo.create({
      reporter: { id: req.user.id },
      product: { id: dto.productId },
      reason: dto.reason,
      details: dto.details,
    });
    await this.reportRepo.save(report);
    return { success: true };
  }
}
