import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from './entities/country.entity';
import { CreateCountryDto } from './dto/create-country.dto';

@Injectable()
export class CountriesService {
  constructor(
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
  ) {}

  // This method would be for an admin to add countries
  create(createCountryDto: CreateCountryDto) {
    const country = this.countryRepository.create(createCountryDto);
    return this.countryRepository.save(country);
  }

  // This will be used by the Flutter app
  findAll(search?: string) {
    if (search) {
      return this.countryRepository
        .createQueryBuilder('country')
        .where('country.name ILIKE :search', { search: `%${search}%` })
        .getMany();
    }
    return this.countryRepository.find();
  }

  // We'll also seed the initial data in the next step
}
