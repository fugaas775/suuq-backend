import { Injectable, Logger } from '@nestjs/common';
import { CountriesService } from '../countries/countries.service';
import { CreateCountryDto } from '../countries/dto/create-country.dto';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly countriesService: CountriesService) {}

  async seedAll() {
    this.logger.log('Running all seeders...');
    await this.seedCountries();
    // Call other seed methods here in the future
    this.logger.log('All seeding complete.');
  }

  async seedCountries() {
    this.logger.log('Starting to seed East African countries...');

    const countriesToSeed: CreateCountryDto[] = [
      {
        name: 'Ethiopia',
        flagUrl: 'https://flagcdn.com/w320/et.png',
        imageUrl: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800',
        description: 'Ethiopia is a landlocked country in the Horn of Africa. It is home to the source of the Blue Nile and has a rich cultural heritage dating back thousands of years.',
        supplies: [
          {
            name: 'Coffee',
            icon: '☕',
            fact: 'Ethiopia is the birthplace of coffee and produces some of the world\'s finest coffee beans.'
          },
          {
            name: 'Honey',
            icon: '🍯',
            fact: 'Ethiopian honey is renowned for its unique floral flavors and traditional production methods.'
          },
          {
            name: 'Spices',
            icon: '🌶️',
            fact: 'Traditional Ethiopian spices like berbere are essential to the country\'s famous cuisine.'
          }
        ]
      },
      {
        name: 'Kenya',
        flagUrl: 'https://flagcdn.com/w320/ke.png',
        imageUrl: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800',
        description: 'Kenya is known for its diverse wildlife, stunning landscapes, and as a major hub for business and tourism in East Africa.',
        supplies: [
          {
            name: 'Tea',
            icon: '🍵',
            fact: 'Kenya is one of the world\'s largest tea producers, known for its high-quality black tea.'
          },
          {
            name: 'Coffee',
            icon: '☕',
            fact: 'Kenyan coffee is famous for its bright acidity and wine-like flavor profile.'
          },
          {
            name: 'Flowers',
            icon: '🌸',
            fact: 'Kenya is a major exporter of fresh flowers, especially roses, to Europe and beyond.'
          }
        ]
      },
      {
        name: 'Uganda',
        flagUrl: 'https://flagcdn.com/w320/ug.png',
        imageUrl: 'https://images.unsplash.com/photo-1605540436563-5bca919ae766?w=800',
        description: 'Uganda, known as the "Pearl of Africa," is famous for its biodiversity, mountain gorillas, and the source of the White Nile.',
        supplies: [
          {
            name: 'Coffee',
            icon: '☕',
            fact: 'Ugandan coffee, especially Arabica from the slopes of Mount Elgon, is highly prized globally.'
          },
          {
            name: 'Vanilla',
            icon: '🌿',
            fact: 'Uganda is one of the world\'s top vanilla producers, known for its high-quality vanilla beans.'
          },
          {
            name: 'Bananas',
            icon: '🍌',
            fact: 'Uganda has more banana varieties than any other country, with over 50 different types.'
          }
        ]
      },
      {
        name: 'Tanzania',
        flagUrl: 'https://flagcdn.com/w320/tz.png',
        imageUrl: 'https://images.unsplash.com/photo-1516445317699-4b1ba76034e3?w=800',
        description: 'Tanzania is home to Mount Kilimanjaro, the Serengeti, and Zanzibar, making it a diverse nation rich in natural wonders.',
        supplies: [
          {
            name: 'Coffee',
            icon: '☕',
            fact: 'Tanzanian coffee, particularly from the slopes of Kilimanjaro, is known for its rich, wine-like flavor.'
          },
          {
            name: 'Cashews',
            icon: '🥜',
            fact: 'Tanzania is one of Africa\'s largest cashew producers, with nuts primarily from coastal regions.'
          },
          {
            name: 'Spices',
            icon: '🧄',
            fact: 'Zanzibar, part of Tanzania, is famous as the "Spice Island" for cloves, cardamom, and cinnamon.'
          }
        ]
      },
      {
        name: 'Rwanda',
        flagUrl: 'https://flagcdn.com/w320/rw.png',
        imageUrl: 'https://images.unsplash.com/photo-1574482620736-02dc07eb78f0?w=800',
        description: 'Rwanda, the "Land of a Thousand Hills," is known for its remarkable recovery, clean cities, and mountain gorillas.',
        supplies: [
          {
            name: 'Coffee',
            icon: '☕',
            fact: 'Rwandan coffee is celebrated for its bright, clean flavor and sustainable farming practices.'
          },
          {
            name: 'Tea',
            icon: '🍵',
            fact: 'Rwanda produces high-quality tea from its highland plantations with unique volcanic soil.'
          },
          {
            name: 'Honey',
            icon: '🍯',
            fact: 'Rwandan honey is produced sustainably and is known for its pure, floral taste.'
          }
        ]
      }
    ];

    for (const countryDto of countriesToSeed) {
      try {
        await this.countriesService.create(countryDto);
        this.logger.log(`Successfully seeded ${countryDto.name}.`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('duplicate key value violates unique constraint')) {
          this.logger.warn(`Country "${countryDto.name}" already exists. Skipping.`);
        } else {
          this.logger.error(`Failed to seed ${countryDto.name}:`, error);
        }
      }
    }

    this.logger.log('Country seeding finished.');
  }
}
