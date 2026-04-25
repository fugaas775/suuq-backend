import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { AssignSupplierStaffDto } from './dto/assign-supplier-staff.dto';
import { UpdateSupplierStaffDto } from './dto/update-supplier-staff.dto';
import { SupplierStaffService } from './supplier-staff.service';

@ApiTags('Supplier Staff')
@Controller('suppliers/v1/profiles/:profileId/staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupplierStaffController {
  constructor(private readonly service: SupplierStaffService) {}

  @Get()
  @ApiOperation({
    summary: 'List staff for a supplier profile (owner, manager, or admin)',
  })
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.SUPPLIER_ACCOUNT,
    UserRole.SUPPLIER_MANAGER,
    UserRole.SUPPLIER_OPERATOR,
  )
  list(@Param('profileId', ParseIntPipe) profileId: number, @Req() req) {
    return this.service.list(profileId, this.actor(req));
  }

  @Post()
  @ApiOperation({
    summary: 'Assign an existing platform user as supplier staff (owner only)',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPLIER_ACCOUNT)
  assign(
    @Param('profileId', ParseIntPipe) profileId: number,
    @Body() dto: AssignSupplierStaffDto,
    @Req() req,
  ) {
    return this.service.assign(profileId, dto, this.actor(req));
  }

  @Patch(':staffId')
  @ApiOperation({ summary: 'Update a staff role or active flag (owner only)' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPLIER_ACCOUNT)
  update(
    @Param('profileId', ParseIntPipe) profileId: number,
    @Param('staffId', ParseIntPipe) staffId: number,
    @Body() dto: UpdateSupplierStaffDto,
    @Req() req,
  ) {
    return this.service.update(profileId, staffId, dto, this.actor(req));
  }

  @Delete(':staffId')
  @ApiOperation({ summary: 'Remove a staff member (owner only)' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPLIER_ACCOUNT)
  remove(
    @Param('profileId', ParseIntPipe) profileId: number,
    @Param('staffId', ParseIntPipe) staffId: number,
    @Req() req,
  ) {
    return this.service.remove(profileId, staffId, this.actor(req));
  }

  private actor(req: any) {
    return {
      id: req.user?.id ?? null,
      roles: (req.user?.roles ?? []) as UserRole[],
    };
  }
}
