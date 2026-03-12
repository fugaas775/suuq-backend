import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSupplierOfferDto } from './dto/create-supplier-offer.dto';
import { SupplierOffersService } from './supplier-offers.service';

@Controller('suppliers/v1/offers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupplierOffersController {
  constructor(private readonly supplierOffersService: SupplierOffersService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPLIER_ACCOUNT)
  findAll() {
    return this.supplierOffersService.findAll();
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPLIER_ACCOUNT)
  create(@Body() dto: CreateSupplierOfferDto) {
    return this.supplierOffersService.create(dto);
  }
}
