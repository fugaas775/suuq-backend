import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { BranchesService } from '../branches/branches.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiTags('Admin — Suuq POS')
@Controller('admin/branches')
export class BranchesAdminController {
  constructor(private readonly branchesService: BranchesService) {}

  /**
   * GET /api/admin/branches
   *
   * Lists all POS branches across all retail tenants.
   * Intended for Super_Admin oversight of pos.suuq-s.com.
   *
   * Query params:
   *   search        — partial match on branch name (case-insensitive)
   *   serviceFormat — filter by service format (RETAIL, QSR, FSR, HOTEL, etc.)
   *   isActive      — true | false
   *   page          — 1-based page number (default 1)
   *   limit         — items per page (default 25, max 100)
   */
  @Get()
  @ApiOperation({ summary: 'List all POS branches (admin overview)' })
  @ApiOkResponse({
    description: 'Paginated branch list with retailTenant and owner',
  })
  async listBranches(
    @Query('search') search?: string,
    @Query('serviceFormat') serviceFormat?: string,
    @Query('isActive') isActive?: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10) || 1) : 1;
    const limit = limitRaw
      ? Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 25))
      : 25;
    const isActiveParsed =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;

    return this.branchesService.adminListBranches({
      search,
      serviceFormat,
      isActive: isActiveParsed,
      page,
      limit,
    });
  }

  /**
   * PATCH /api/admin/branches/:id
   *
   * Partially updates a branch. Currently supports toggling isActive.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Patch a branch (admin)' })
  async patchBranch(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { isActive?: boolean },
  ) {
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
      throw new BadRequestException('isActive must be a boolean');
    }
    return this.branchesService.patchAdminBranch(id, body);
  }

  /**
   * DELETE /api/admin/branches/bulk
   * Bulk delete branches by id array in request body.
   * Must be declared before :id route.
   */
  @Delete('bulk')
  @ApiOperation({ summary: 'Bulk delete branches (admin)' })
  async bulkDeleteBranches(@Body() body: { ids: number[] }) {
    if (!Array.isArray(body?.ids) || !body.ids.length) {
      throw new BadRequestException('ids must be a non-empty array');
    }
    const deleted = await this.branchesService.bulkDeleteAdminBranches(
      body.ids,
    );
    return { deleted };
  }

  /**
   * DELETE /api/admin/branches/:id
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a branch (admin)' })
  async deleteBranch(@Param('id', ParseIntPipe) id: number) {
    await this.branchesService.deleteAdminBranch(id);
    return { message: `Branch #${id} deleted.` };
  }
}
