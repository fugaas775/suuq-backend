import { Controller, Patch, Param, Body, UseGuards, ParseIntPipe, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductImageModeration } from './entities/product-image-moderation.entity';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';

@Controller('vendor/moderation')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.VENDOR)
export class VendorAppealsController {
  constructor(
    @InjectRepository(ProductImageModeration)
    private pimRepo: Repository<ProductImageModeration>,
  ) {}

  @Patch(':id/appeal')
  async appeal(
    @Param('id', ParseIntPipe) id: number,
    @Body('message') message: string,
  ) {
    const record = await this.pimRepo.findOne({ where: { id } });
    if (!record) throw new ForbiddenException('Not found');
    // Basic: allow one appeal per record and reset to pending for re-review
    await this.pimRepo.update(id, {
      appealMessage: message || null,
      appealedAt: new Date(),
      status: 'pending',
    });
    return { ok: true };
  }
}
