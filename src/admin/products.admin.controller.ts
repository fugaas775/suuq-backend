import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { ProductsService } from '../products/products.service';
import { SkipThrottle } from '@nestjs/throttler';
import { Query } from '@nestjs/common';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Controller([
  'admin/products',
  'admin/product-approvals',
  'admin/product-approval',
])
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('search-basic')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async searchBasic(@Query('q') q: string) {
    return this.products.searchBasic(q);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
    @Query('q') q?: string,
    @Query('featured') featured?: string,
  ) {
    return this.products.listForAdmin({
      status,
      page: Number(page),
      perPage: Number(perPage),
      q,
      featured:
        featured === 'true' ? true : featured === 'false' ? false : undefined,
    });
  }

  @Get('pending')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listPending() {
    return this.products.listPendingApproval();
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async approve(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const actorId = (req?.user?.id as number) || null;
    return this.products.approveProduct(id, { actorId });
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status?: 'rejected' | 'draft'; reason?: string },
    @Req() req: any,
  ) {
    const actorId = (req?.user?.id as number) || null;
    const toStatus = body?.status === 'draft' ? 'draft' : 'rejected';
    const reason = body?.reason ? String(body.reason) : null;
    return this.products.rejectProduct(id, { actorId, toStatus, reason });
  }

  @Patch(':id/feature')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async feature(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      featured: boolean;
      expiresAt?: string;
      amountPaid?: number;
      currency?: string;
    },
  ) {
    const expires = body.expiresAt ? new Date(body.expiresAt) : undefined;
    return this.products.adminSetFeatured(
      id,
      !!body.featured,
      expires,
      body.amountPaid,
      body.currency,
    );
  }

  @Post('bulk-approve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async bulkApprove(@Body() body: { ids: number[] }, @Req() req: any) {
    const actorId = (req?.user?.id as number) || null;
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    return this.products.bulkApprove(ids, { actorId });
  }

  @Post('bulk-reject')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async bulkReject(
    @Body()
    body: { ids: number[]; status?: 'rejected' | 'draft'; reason?: string },
    @Req() req: any,
  ) {
    const actorId = (req?.user?.id as number) || null;
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    const toStatus = body?.status === 'draft' ? 'draft' : 'rejected';
    const reason = body?.reason ? String(body.reason) : null;
    return this.products.bulkReject(ids, { actorId, toStatus, reason });
  }

  // Soft delete: hide product; reversible via restore
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async softDelete(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    const actorId = (req?.user?.id as number) || null;
    const reason = (body?.reason ? String(body.reason) : undefined) as any;
    return this.products.softDeleteByAdmin(id, { actorId, reason });
  }

  // Restore a previously soft-deleted product
  @Patch(':id/restore')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async restore(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    const actorId = (req?.user?.id as number) || null;
    const reason = (body?.reason ? String(body.reason) : undefined) as any;
    return this.products.restoreByAdmin(id, { actorId, reason });
  }

  // Hard delete: irreversible; SUPER_ADMIN only
  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.SUPER_ADMIN)
  async hardDelete(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    const actorId = (req?.user?.id as number) || null;
    const reason = (body?.reason ? String(body.reason) : undefined) as any;
    await this.products.hardDeleteByAdmin(id, { actorId, reason });
  }
}
