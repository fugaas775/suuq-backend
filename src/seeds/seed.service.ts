import { Injectable, Logger } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service';
import { CountriesService } from '../countries/countries.service';
import { CreateCountryDto } from '../countries/dto/create-country.dto';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly countriesService: CountriesService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async seedAll() {
    this.logger.log('Running all seeders...');
    await this.seedCountries();
    await this.seedCategoryIcons();
    // Call other seed methods here in the future
    this.logger.log('All seeding complete.');
  }

  /** Backfill iconName for categories, idempotent create/update */
  async seedCategoryIcons() {
    this.logger.log('Seeding category icons (iconName backfill)...');
    // Define desired icon names per slug; extend as needed
    const iconBySlug: Record<string, string> = {
      electronics: 'mdi:devices',
      phones: 'mdi:cellphone',
      computers: 'mdi:laptop',
      tvs: 'mdi:television',
      fashion: 'mdi:tshirt-crew',
      'mens-fashion': 'mdi:human-male',
      'womens-fashion': 'mdi:human-female',
      'home-garden': 'mdi:home',
      home: 'mdi:home',
      furniture: 'mdi:sofa',
      decor: 'mdi:palette',
      kitchen: 'mdi:stove',
      'sports-outdoors': 'mdi:tennis',
      sports: 'mdi:tennis',
      fitness: 'mdi:dumbbell',
      camping: 'mdi:campfire',
      'health-beauty': 'mdi:spa',
      beauty: 'mdi:spa',
      skincare: 'mdi:face-woman',
      supplements: 'mdi:pill',
      'toys-games': 'mdi:toy-brick',
      'board-games': 'mdi:chess-knight',
      'outdoor-toys': 'mdi:gamepad-variant',
    };

    const slugs = Object.keys(iconBySlug);
    for (const slug of slugs) {
      const desiredIcon = iconBySlug[slug];
      const existing = await this.categoriesService.findBySlug(slug);
      if (!existing) {
        try {
          await this.categoriesService.create({ name: slug.replace(/-/g, ' '), slug, iconName: desiredIcon });
          this.logger.log(`Created category '${slug}' with icon '${desiredIcon}'.`);
        } catch (e) {
          this.logger.warn(`Could not create category '${slug}': ${(e as Error).message}`);
        }
      } else if (!existing.iconName) {
        await this.categoriesService.update(existing.id, { iconName: desiredIcon });
        this.logger.log(`Backfilled iconName for '${slug}' -> '${desiredIcon}'.`);
      }
    }

    this.logger.log('Category icons seeding finished.');
  }

  /** Seed categories and subcategories with iconName using JSON data */
  async seedCategoriesFromJson() {
    this.logger.log('Seeding categories with icons from JSON...');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const data: Record<string, { iconName: string; subcategories?: { name: string; iconName?: string }[] }> = require('./data/categories_with_icons.json');

    for (const [parentName, meta] of Object.entries(data)) {
      const parentSlug = this.slugifyName(parentName);
      let parent = await this.categoriesService.findBySlug(parentSlug);
      const parentIconUrl = meta.iconName ? this.buildIconUrl(meta.iconName) : undefined;
      if (!parent) {
        parent = await this.categoriesService.create({ name: parentName, slug: parentSlug, iconName: meta.iconName, iconUrl: parentIconUrl });
        this.logger.log(`Created parent '${parentName}' (${parentSlug})`);
      } else {
        const patch: any = {};
        if (!parent.iconName && meta.iconName) patch.iconName = meta.iconName;
        if (!parent.iconUrl && parentIconUrl) patch.iconUrl = parentIconUrl;
        if (Object.keys(patch).length) {
          await this.categoriesService.update(parent.id, patch);
          this.logger.log(`Backfilled parent '${parentName}' with ${JSON.stringify(patch)}`);
        }
      }

      if (meta.subcategories?.length) {
        for (const sub of meta.subcategories) {
          const subSlug = this.slugifyName(sub.name);
          let child = await this.categoriesService.findBySlug(subSlug);
          const childIconUrl = sub.iconName ? this.buildIconUrl(sub.iconName) : undefined;
          if (!child) {
            child = await this.categoriesService.create({ name: sub.name, slug: subSlug, iconName: sub.iconName, iconUrl: childIconUrl, parentId: parent.id });
            this.logger.log(`Created child '${sub.name}' under '${parentName}'`);
          } else {
            const patch: any = {};
            if (!child.iconName && sub.iconName) patch.iconName = sub.iconName;
            if (!child.iconUrl && childIconUrl) patch.iconUrl = childIconUrl;
            if (!child.parent) patch.parentId = parent.id; // attach if orphan
            if (Object.keys(patch).length) {
              await this.categoriesService.update(child.id, patch);
              this.logger.log(`Updated child '${sub.name}' with ${JSON.stringify(patch)}`);
            }
          }
        }
      }
    }
    this.logger.log('Categories with icons seeding from JSON finished.');
  }

  private slugifyName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** Build an icon URL from env configuration and iconName */
  // Exported for testability
  public buildIconUrl(iconName: string | undefined): string | undefined {
    if (!iconName) return undefined;
    const template = process.env.ICON_URL_TEMPLATE; // e.g., https://cdn.example/icons/{icon}.svg
    if (template) {
      return template.replace('{icon}', iconName);
    }
    const base = process.env.ICON_CDN_BASE; // e.g., https://cdn.example/icons
    if (base) {
      const ext = process.env.ICON_EXT || 'svg';
      return `${base.replace(/\/$/, '')}/${iconName}.${ext}`;
    }
    return undefined; // no auto-fill configured
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
