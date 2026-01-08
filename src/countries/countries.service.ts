import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from './entities/country.entity';
import { CreateCountryDto } from './dto/create-country.dto';
import { translateEntities } from '../common/utils/translation.util';

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
  async findAll(search?: string, lang: string = 'en') {
    let countries: Country[];
    if (search) {
      countries = await this.countryRepository
        .createQueryBuilder('country')
        .where('country.name ILIKE :search', { search: `%${search}%` })
        .getMany();
    } else {
      countries = await this.countryRepository.find();
    }

    return translateEntities(countries, lang, {
      name: 'nameTranslations',
      description: 'descriptionTranslations',
    });
  }

  // We'll also seed the initial data in the next step
}
