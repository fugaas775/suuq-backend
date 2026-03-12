import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AssignBranchStaffDto } from './dto/assign-branch-staff.dto';
import { BranchStaffService } from './branch-staff.service';

@Controller('pos/v1/branches/:branchId/staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchStaffController {
  constructor(private readonly branchStaffService: BranchStaffService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  findByBranch(@Param('branchId') branchId: string) {
    return this.branchStaffService.findByBranch(Number(branchId));
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.POS_MANAGER)
  assign(
    @Param('branchId') branchId: string,
    @Body() dto: AssignBranchStaffDto,
  ) {
    return this.branchStaffService.assign(Number(branchId), dto);
  }
}
