import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePartnerCredentialDto } from './dto/create-partner-credential.dto';
import { PartnerCredentialsService } from './partner-credentials.service';

@Controller('admin/v1/partner-credentials')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PartnerCredentialsController {
  constructor(
    private readonly partnerCredentialsService: PartnerCredentialsService,
  ) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findAll() {
    return this.partnerCredentialsService.findAll();
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  create(@Body() dto: CreatePartnerCredentialDto) {
    return this.partnerCredentialsService.create(dto);
  }
}
