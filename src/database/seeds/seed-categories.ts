import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Category } from '../../categories/entities/category.entity';
import { TreeRepository } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const categoryRepo = app.get<TreeRepository<Category>>(
    getRepositoryToken(Category),
  );

  console.log('--- Seeding Production Categories for Suuq Marketplace ---');

  // Clear the table to ensure a clean seed.
  // In a real production environment, you might migrate data instead of clearing.
  console.log('Clearing existing categories...');
  await categoryRepo.query(
    'TRUNCATE "category_closure" RESTART IDENTITY CASCADE;',
  );
  await categoryRepo.query('TRUNCATE "category" RESTART IDENTITY CASCADE;');

  // --- 1. Define and Create Parent Categories ---
  const parents = [
    categoryRepo.create({
      name: 'Vehicles',
      slug: 'vehicles',
      iconName: 'car-multiple',
    }),
    categoryRepo.create({
      name: 'Property',
      slug: 'property',
      iconName: 'home-city-outline',
    }),
    categoryRepo.create({
      name: 'Electronics',
      slug: 'electronics',
      iconName: 'cellphone-chip',
    }),
    categoryRepo.create({
      name: 'Jobs',
      slug: 'jobs',
      iconName: 'briefcase-outline',
    }),
    categoryRepo.create({
      name: 'Fashion & Beauty',
      slug: 'fashion-beauty',
      iconName: 'hanger',
    }),
    categoryRepo.create({
      name: 'Home & Garden',
      slug: 'home-garden',
      iconName: 'sofa-outline',
    }),
    categoryRepo.create({
      name: 'Services',
      slug: 'services',
      iconName: 'face-agent',
    }),
    categoryRepo.create({
      name: 'Agriculture & Food',
      slug: 'agriculture-food',
      iconName: 'barley',
    }),
    categoryRepo.create({
      name: 'Education',
      slug: 'education',
      iconName: 'school-outline',
    }),
    categoryRepo.create({
      name: 'Community',
      slug: 'community',
      iconName: 'account-group-outline',
    }),
  ];

  await categoryRepo.save(parents);
  console.log('✅ Top-level categories created.');

  // --- 2. Define and Create Child Categories ---
  const [
    vehicles,
    property,
    electronics,
    jobs,
    fashion,
    home,
    services,
    agriculture,
    education,
    community,
  ] = parents;

  const children = [
    // Vehicles
    categoryRepo.create({
      name: 'Cars for Sale',
      slug: 'cars-for-sale',
      parent: vehicles,
    }),
    categoryRepo.create({
      name: 'Motorcycles',
      slug: 'motorcycles',
      parent: vehicles,
    }),
    categoryRepo.create({
      name: 'Trucks & Heavy Duty',
      slug: 'trucks-heavy-duty',
      parent: vehicles,
    }),
    categoryRepo.create({
      name: 'Auto Parts & Accessories',
      slug: 'auto-parts',
      parent: vehicles,
    }),

    // Property
    categoryRepo.create({
      name: 'Houses & Apartments for Sale',
      slug: 'property-for-sale',
      parent: property,
    }),
    categoryRepo.create({
      name: 'Houses & Apartments for Rent',
      slug: 'property-for-rent',
      parent: property,
    }),
    categoryRepo.create({
      name: 'Land & Plots',
      slug: 'land-plots',
      parent: property,
    }),
    categoryRepo.create({
      name: 'Commercial Property',
      slug: 'commercial-property',
      parent: property,
    }),

    // Electronics
    categoryRepo.create({
      name: 'Mobile Phones & Tablets',
      slug: 'mobile-phones-tablets',
      parent: electronics,
    }),
    categoryRepo.create({
      name: 'Laptops & Computers',
      slug: 'laptops-computers',
      parent: electronics,
    }),
    categoryRepo.create({
      name: 'TVs, Video & Audio',
      slug: 'tvs-video-audio',
      parent: electronics,
    }),
    categoryRepo.create({
      name: 'Home Appliances',
      slug: 'home-appliances',
      parent: electronics,
    }),

    // Jobs
    categoryRepo.create({
      name: 'Accounting & Finance',
      slug: 'jobs-accounting-finance',
      parent: jobs,
    }),
    categoryRepo.create({
      name: 'IT & Software',
      slug: 'jobs-it-software',
      parent: jobs,
    }),
    categoryRepo.create({
      name: 'Sales & Marketing',
      slug: 'jobs-sales-marketing',
      parent: jobs,
    }),
    categoryRepo.create({
      name: 'Healthcare',
      slug: 'jobs-healthcare',
      parent: jobs,
    }),

    // Fashion & Beauty
    categoryRepo.create({
      name: "Men's Clothing & Shoes",
      slug: 'fashion-men',
      parent: fashion,
    }),
    categoryRepo.create({
      name: "Women's Clothing & Shoes",
      slug: 'fashion-women',
      parent: fashion,
    }),
    categoryRepo.create({
      name: 'Watches, Bags & Jewelry',
      slug: 'fashion-accessories',
      parent: fashion,
    }),
    categoryRepo.create({
      name: 'Health & Beauty Products',
      slug: 'health-beauty-products',
      parent: fashion,
    }),

    // Home & Garden
    categoryRepo.create({ name: 'Furniture', slug: 'furniture', parent: home }),
    categoryRepo.create({
      name: 'Kitchenware',
      slug: 'kitchenware',
      parent: home,
    }),
    categoryRepo.create({
      name: 'Home Decor',
      slug: 'home-decor',
      parent: home,
    }),
    categoryRepo.create({
      name: 'Garden & Outdoor',
      slug: 'garden-outdoor',
      parent: home,
    }),

    // Services
    categoryRepo.create({
      name: 'Cleaning Services',
      slug: 'services-cleaning',
      parent: services,
    }),
    categoryRepo.create({
      name: 'Repair Services',
      slug: 'services-repair',
      parent: services,
    }),
    categoryRepo.create({
      name: 'Events & Catering',
      slug: 'services-events',
      parent: services,
    }),
    categoryRepo.create({
      name: 'Classes & Tutoring',
      slug: 'services-tutoring',
      parent: services,
    }),

    // Agriculture & Food
    categoryRepo.create({
      name: 'Livestock',
      slug: 'livestock',
      parent: agriculture,
    }),
    categoryRepo.create({
      name: 'Farm Machinery & Equipment',
      slug: 'farm-machinery',
      parent: agriculture,
    }),
    categoryRepo.create({
      name: 'Fresh Produce',
      slug: 'fresh-produce',
      parent: agriculture,
    }),

    // Education
    categoryRepo.create({
      name: 'Textbooks & Study Material',
      slug: 'education-textbooks',
      parent: education,
    }),
    categoryRepo.create({
      name: 'Professional Courses',
      slug: 'education-courses',
      parent: education,
    }),

    // Community
    categoryRepo.create({
      name: 'Events',
      slug: 'community-events',
      parent: community,
    }),
    categoryRepo.create({
      name: 'Lost & Found',
      slug: 'community-lost-found',
      parent: community,
    }),
  ];

  await categoryRepo.save(children);
  console.log('✅ Sub-categories created.');

  console.log('🎉 Production category seeding complete!');
  await app.close();
}

bootstrap();
