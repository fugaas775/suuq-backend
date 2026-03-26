import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchLog } from '../search/entities/search-log.entity';
import { SkipThrottle } from '@nestjs/throttler';
import { SearchLogQueryDto } from './dto/search-log-query.dto';

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
  async list(@Query() query: SearchLogQueryDto) {
    const take = query.limit ?? 50;
    const qb = this.searchLogRepo
      .createQueryBuilder('log')
      .orderBy('log.created_at', 'DESC')
      .take(take);
    const searchTerm = query.q?.trim();
    if (searchTerm) {
      qb.andWhere('log.query ILIKE :q', { q: `%${searchTerm}%` });
    }
    const source = query.source?.trim();
    if (source) {
      qb.andWhere('log.source = :source', { source });
    }
    return qb.getMany();
  }
}
