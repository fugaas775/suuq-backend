import {
  Body,
  Controller,
  Delete,
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

@UseGuards(AuthGuard('jwt'), RolesGuard)
@SkipThrottle()
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: ProductsService) {}

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
