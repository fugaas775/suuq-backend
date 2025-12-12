import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { RolesGuard } from '../auth/roles.guard';
import { FeatureFlagGuard } from '../common/feature-flags/feature-flag.guard';
import { RequireFeature } from '../common/feature-flags/feature-flag.decorator';
import { AdminOutreachService } from './outreach.admin.service';
import { CreateOutreachTaskDto } from './dto/create-outreach-task.dto';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SkipThrottle } from '@nestjs/throttler';

@UseGuards(AuthGuard('jwt'), RolesGuard, FeatureFlagGuard)
@SkipThrottle()
@Controller('admin/outreach-tasks')
export class AdminOutreachController {
  constructor(private readonly outreach: AdminOutreachService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @RequireFeature('supply_outreach_tasks')
  async createTask(
    @Body() dto: CreateOutreachTaskDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminId = req.user?.id;
    if (!adminId) {
      throw new UnauthorizedException('Admin identity required');
    }
    return this.outreach.createTask({ ...dto, createdByAdminId: adminId });
  }
}
