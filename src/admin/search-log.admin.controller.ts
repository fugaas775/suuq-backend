import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchLog } from '../search/entities/search-log.entity';
import { SkipThrottle } from '@nestjs/throttler';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Controller('admin/search-logs')
export class AdminSearchLogController {
  constructor(
    @InjectRepository(SearchLog)
    private readonly searchLogRepo: Repository<SearchLog>,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async list(
    @Query('q') q?: string,
    @Query('source') source?: string,
    @Query('limit') limit?: string,
  ) {
    const take = limit ? Math.min(Number(limit) || 50, 200) : 50;
    const qb = this.searchLogRepo
      .createQueryBuilder('log')
      .orderBy('log.created_at', 'DESC')
      .take(take);
    if (q && q.trim()) {
      qb.andWhere('log.query ILIKE :q', { q: `%${q.trim()}%` });
    }
    if (source && source.trim()) {
      qb.andWhere('log.source = :source', { source: source.trim() });
    }
    return qb.getMany();
  }
}
