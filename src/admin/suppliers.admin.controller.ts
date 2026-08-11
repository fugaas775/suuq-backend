import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { SupplierOnboardingStatus } from '../suppliers/entities/supplier-profile.entity';
import { SuppliersService } from '../suppliers/suppliers.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiTags('Admin — Suuq POS')
@Controller('admin/suppliers')
export class SuppliersAdminController {
  constructor(private readonly suppliersService: SuppliersService) {}

  /**
   * GET /api/admin/suppliers
   *
   * Lists supplier accounts across all tenants for Super_Admin oversight — the
   * supplier-side mirror of GET /api/admin/branches. Powers the Seller Hub
   * "act as owner" bar so the operator can locate and enter any supplier.
   *
   * Query params:
   *   search — partial match on company name (case-insensitive)
   *   status — filter by onboarding status (DRAFT | PENDING_REVIEW | APPROVED | REJECTED)
   *   page   — 1-based page number (default 1)
   *   limit  — items per page (default 25, max 100)
   */
  @Get()
  @ApiOperation({ summary: 'List supplier accounts (admin overview)' })
  @ApiOkResponse({ description: 'Paginated supplier list with owner' })
  async listSuppliers(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1;
    const limit = limitRaw
      ? Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 25))
      : 25;
    const statusParsed =
      status &&
      (Object.values(SupplierOnboardingStatus) as string[]).includes(status)
        ? (status as SupplierOnboardingStatus)
        : undefined;

    return this.suppliersService.adminSearchSuppliers({
      search,
      status: statusParsed,
      page,
      limit,
    });
  }

  /**
   * PATCH /api/admin/suppliers/:id
   *
   * Deactivate / reactivate a supplier account WITHOUT deleting it — the
   * supplier-side mirror of PATCH /api/admin/branches/:id. Currently supports
   * toggling `isActive`.
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Patch a supplier account (admin) — toggle isActive',
  })
  async patchSupplier(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { isActive?: boolean },
    @Req() req,
  ) {
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
      throw new BadRequestException('isActive must be a boolean');
    }
    return this.suppliersService.patchAdminSupplier(id, body, {
      id: req.user?.id ?? null,
      email: req.user?.email ?? null,
    });
  }
}
