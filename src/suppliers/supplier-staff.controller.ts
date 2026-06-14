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
import { SupplierStaffService } from './supplier-staff.service';
import { InviteSupplierStaffDto } from './dto/invite-supplier-staff.dto';
import { UpdateSupplierStaffDto } from './dto/update-supplier-staff.dto';

/**
 * Supplier team management — the wholesaler-side mirror of branch staff.
 * Ownership-gated (manager-level only) inside the service; no @Roles needed
 * since membership, not a global role, is the authority.
 */
@ApiTags('B2B Suppliers')
@Controller('hub/v1/suppliers/me/staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupplierStaffController {
  constructor(private readonly supplierStaffService: SupplierStaffService) {}

  @Get()
  @ApiOperation({ summary: "List the signed-in supplier account's team" })
  list(@Req() req) {
    return this.supplierStaffService.listStaff({
      id: req.user?.id,
      roles: req.user?.roles,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Invite a teammate to the supplier account' })
  invite(@Body() dto: InviteSupplierStaffDto, @Req() req) {
    return this.supplierStaffService.inviteStaff(
      { id: req.user?.id, roles: req.user?.roles },
      dto,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a teammate (role / permissions / active)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierStaffDto,
    @Req() req,
  ) {
    return this.supplierStaffService.updateStaff(
      { id: req.user?.id, roles: req.user?.roles },
      id,
      dto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a teammate' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.supplierStaffService.removeStaff(
      { id: req.user?.id, roles: req.user?.roles },
      id,
    );
  }
}
