import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from '../categories/entities/category.entity';
import { TreeRepository } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const categoryRepo = app.get<TreeRepository<Category>>(
    getRepositoryToken(Category),
  );

  console.log('Clearing existing categories...');
  await categoryRepo.clear();

  console.log('Seeding new categories...');

  // Create root categories in memory
  const electronics = categoryRepo.create({
    name: 'Electronics',
    slug: 'electronics',
  });
  const fashion = categoryRepo.create({ name: 'Fashion', slug: 'fashion' });
  const home = categoryRepo.create({ name: 'Home', slug: 'home' });
  const beauty = categoryRepo.create({ name: 'Beauty', slug: 'beauty' });
  const sports = categoryRepo.create({ name: 'Sports', slug: 'sports' });

  // Save all root categories in one go
  await categoryRepo.save([electronics, fashion, home, beauty, sports]);

  // Create child categories in memory, linking them to their parents
  const phones = categoryRepo.create({
    name: 'Phones',
    slug: 'phones',
    parent: electronics,
  });
  const computers = categoryRepo.create({
    name: 'Computers',
    slug: 'computers',
    parent: electronics,
  });
  const mensFashion = categoryRepo.create({
    name: "Men's Fashion",
    slug: 'mens-fashion',
    parent: fashion,
  });
  const womensFashion = categoryRepo.create({
    name: "Women's Fashion",
    slug: 'womens-fashion',
    parent: fashion,
  });
  const kitchen = categoryRepo.create({
    name: 'Kitchen',
    slug: 'kitchen',
    parent: home,
  });
  const decor = categoryRepo.create({
    name: 'Decor',
    slug: 'decor',
    parent: home,
  });

  // Save all child categories in one go
  await categoryRepo.save([
    phones,
    computers,
    mensFashion,
    womensFashion,
    kitchen,
    decor,
  ]);

  console.log('Hierarchical categories seeded successfully.');
  await app.close();
}

bootstrap();
