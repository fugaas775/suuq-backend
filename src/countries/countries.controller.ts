import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { CountriesService } from './countries.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  // Admin-only endpoint to add new countries
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() createCountryDto: CreateCountryDto) {
    return this.countriesService.create(createCountryDto);
  }

  // Public endpoint for the app to fetch countries
  @Get()
  findAll(
    @Query('search') search?: string,
    @Headers('accept-language') lang?: string,
  ) {
    // Default to 'en' if not provided
    return this.countriesService.findAll(search, lang || 'en');
  }
}
