import {
  Body,
  Controller,
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
import { SupplierOffersService } from './supplier-offers.service';
import { CreateSupplierOfferDto } from './dto/create-supplier-offer.dto';
import { UpdateSupplierOfferDto } from './dto/update-supplier-offer.dto';

/**
 * Supplier catalog management. All routes are scoped to the acting user's own
 * supplier profile (resolved in the service), so ownership — not a role — is the
 * authorization boundary; any authenticated user with a profile manages only
 * their own offers.
 */
@ApiTags('B2B Supplier Offers')
@Controller('hub/v1/supplier-offers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupplierOffersController {
  constructor(private readonly supplierOffersService: SupplierOffersService) {}

  @Get('me')
  @ApiOperation({ summary: 'List the signed-in supplier’s offers' })
  listMine(@Req() req) {
    return this.supplierOffersService.listForUser(req.user?.id);
  }

  @Post('me')
  @ApiOperation({ summary: 'Create a draft offer for the signed-in supplier' })
  createMine(@Body() dto: CreateSupplierOfferDto, @Req() req) {
    return this.supplierOffersService.createForUser(req.user?.id, dto);
  }

  @Patch('me/:id')
  @ApiOperation({ summary: 'Update one of the signed-in supplier’s offers' })
  updateMine(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierOfferDto,
    @Req() req,
  ) {
    return this.supplierOffersService.updateForUser(req.user?.id, id, dto);
  }

  @Patch('me/:id/publish')
  @ApiOperation({
    summary: 'Publish an offer (requires an approved supplier profile)',
  })
  publishMine(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.supplierOffersService.publishForUser(req.user?.id, id);
  }

  @Patch('me/:id/archive')
  @ApiOperation({
    summary: 'Archive an offer so it no longer surfaces to buyers',
  })
  archiveMine(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.supplierOffersService.archiveForUser(req.user?.id, id);
  }
}
