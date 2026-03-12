import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSupplierProfileDto } from './dto/create-supplier-profile.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers/v1/profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPLIER_ACCOUNT)
  findAll() {
    return this.suppliersService.findAll();
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPLIER_ACCOUNT)
  create(@Body() dto: CreateSupplierProfileDto) {
    return this.suppliersService.create(dto);
  }
}
