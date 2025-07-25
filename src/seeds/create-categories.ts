import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CategoriesService } from '../categories/categories.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const categoriesService = app.get(CategoriesService);

  // Create root categories
  const electronics = await categoriesService.create({ name: 'Electronics', slug: 'electronics' });
  const fashion = await categoriesService.create({ name: 'Fashion', slug: 'fashion' });
  const homeGarden = await categoriesService.create({ name: 'Home & Garden', slug: 'home-garden' });
  const sportsOutdoors = await categoriesService.create({ name: 'Sports & Outdoors', slug: 'sports-outdoors' });
  const healthBeauty = await categoriesService.create({ name: 'Health & Beauty', slug: 'health-beauty' });
  const toysGames = await categoriesService.create({ name: 'Toys & Games', slug: 'toys-games' });

  // Create child categories for Electronics

  const phones = await categoriesService.create({ name: 'Phones', slug: 'phones', parentId: electronics.id });
  const computers = await categoriesService.create({ name: 'Computers', slug: 'computers', parentId: electronics.id });
  const tvs = await categoriesService.create({ name: 'TVs', slug: 'tvs', parentId: electronics.id });

  // Create child categories for Fashion
  const mens = await categoriesService.create({ name: "Men's Fashion", slug: 'mens-fashion', parentId: fashion.id });
  const womens = await categoriesService.create({ name: "Women's Fashion", slug: 'womens-fashion', parentId: fashion.id });

  // Create child categories for Home & Garden
  const furniture = await categoriesService.create({ name: 'Furniture', slug: 'furniture', parentId: homeGarden.id });
  const decor = await categoriesService.create({ name: 'Decor', slug: 'decor', parentId: homeGarden.id });

  // Create child categories for Sports & Outdoors
  const fitness = await categoriesService.create({ name: 'Fitness', slug: 'fitness', parentId: sportsOutdoors.id });
  const camping = await categoriesService.create({ name: 'Camping', slug: 'camping', parentId: sportsOutdoors.id });

  // Create child categories for Health & Beauty
  const skincare = await categoriesService.create({ name: 'Skincare', slug: 'skincare', parentId: healthBeauty.id });
  const supplements = await categoriesService.create({ name: 'Supplements', slug: 'supplements', parentId: healthBeauty.id });

  // Create child categories for Toys & Games
  const boardGames = await categoriesService.create({ name: 'Board Games', slug: 'board-games', parentId: toysGames.id });
  const outdoorToys = await categoriesService.create({ name: 'Outdoor Toys', slug: 'outdoor-toys', parentId: toysGames.id });

  console.log('Hierarchical categories seeded.');

  await app.close();
}

bootstrap();
