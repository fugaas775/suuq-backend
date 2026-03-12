import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePosSyncJobDto } from './dto/create-pos-sync-job.dto';
import { PosSyncService } from './pos-sync.service';

@Controller('pos/v1/sync/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PosSyncController {
  constructor(private readonly posSyncService: PosSyncService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  findAll() {
    return this.posSyncService.findAll();
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  create(@Body() dto: CreatePosSyncJobDto) {
    return this.posSyncService.create(dto);
  }
}
