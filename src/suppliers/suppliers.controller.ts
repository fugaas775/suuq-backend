import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { SuppliersService } from './suppliers.service';
import { SupplierStaffService } from './supplier-staff.service';
import { CreateSupplierProfileDto } from './dto/create-supplier-profile.dto';
import { UpdateSupplierProfileDto } from './dto/update-supplier-profile.dto';
import { RejectSupplierProfileDto } from './dto/reject-supplier-profile.dto';
import { ListSupplierProfilesQueryDto } from './dto/list-supplier-profiles-query.dto';
import { extractActiveSupplierId } from './active-supplier.util';

@ApiTags('B2B Suppliers')
@Controller('hub/v1/suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly supplierStaffService: SupplierStaffService,
  ) {}

  // ---- Self-service: any authenticated user can apply to become a supplier --

  /**
   * Every supplier account the signed-in user can operate (owned + manager/
   * operator assignments). Powers the Seller Hub workspace switcher so a user
   * can jump into any of their supplier accounts — the supplier mirror of the
   * branch list. Independent of the (sometimes stale) cached portal session.
   */
  @Get('me/accounts')
  @ApiOperation({
    summary: 'List every supplier account the signed-in user can operate',
  })
  listMyAccounts(@Req() req) {
    return this.supplierStaffService.getSupplierContextsForUser({
      id: req.user?.id,
      roles: req.user?.roles,
    });
  }

  @Post('me')
  @ApiOperation({
    summary: 'Create the signed-in user’s supplier profile (draft)',
  })
  createMine(@Body() dto: CreateSupplierProfileDto, @Req() req) {
    return this.suppliersService.createForUser(req.user?.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the signed-in user’s supplier profile' })
  getMine(@Req() req) {
    return this.suppliersService.getForUser(
      req.user?.id,
      extractActiveSupplierId(req),
      req.user?.roles,
    );
  }

  @Patch('me')
  @ApiOperation({
    summary:
      'Update the signed-in user’s supplier profile (draft / rejected only)',
  })
  updateMine(@Body() dto: UpdateSupplierProfileDto, @Req() req) {
    return this.suppliersService.updateForUser(
      req.user?.id,
      dto,
      extractActiveSupplierId(req),
      req.user?.roles,
    );
  }

  @Post('me/submit')
  @ApiOperation({ summary: 'Submit the supplier profile for admin review' })
  submitMine(@Req() req) {
    return this.suppliersService.submitForReview(
      req.user?.id,
      extractActiveSupplierId(req),
      req.user?.roles,
    );
  }

  // ---- Admin review --------------------------------------------------------

  @Get()
  @ApiOperation({ summary: 'List supplier profiles (admin)' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  list(@Query() query: ListSupplierProfilesQueryDto) {
    return this.suppliersService.listAll(query.status);
  }

  @Patch(':id/approve')
  @ApiOperation({
    summary: 'Approve a supplier profile pending review (admin)',
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  approve(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.suppliersService.approve(id, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a supplier profile pending review (admin)' })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectSupplierProfileDto,
    @Req() req,
  ) {
    return this.suppliersService.reject(id, dto, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }
}
