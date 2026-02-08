import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ProductsService } from '../products/products.service';
import { CategoriesService } from '../categories/categories.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('CreateProducts');
  const app = await NestFactory.createApplicationContext(AppModule);
  const productsService = app.get(ProductsService);
  const categoriesService = app.get(CategoriesService);

  // Sample East African Marketplace Products
  const sampleProducts = [
    // Food & Beverages
    {
      name: 'Ethiopian Coffee Beans - Yirgacheffe',
      description:
        'Premium single-origin Ethiopian coffee beans from Yirgacheffe region. Known for bright acidity and floral notes.',
      price: 850,
      currency: 'ETB',
      vendorId: 1,
      categoryName: 'Food & Beverages',
      tags: ['coffee', 'organic', 'ethiopian', 'premium'],
      featured: true,
      stock_quantity: 50,
      manage_stock: true,
    },
    {
      name: 'Kenyan Black Tea - Premium Grade',
      description:
        'High-quality black tea from the highlands of Kenya. Rich and full-bodied with malty undertones.',
      price: 1200,
      currency: 'KES',
      vendorId: 1,
      categoryName: 'Food & Beverages',
      tags: ['tea', 'kenyan', 'black-tea', 'premium'],
      stock_quantity: 75,
      manage_stock: true,
    },
    {
      name: 'Injera Flour - Teff Blend',
      description:
        'Traditional Ethiopian teff flour perfect for making authentic injera bread. Gluten-free and nutritious.',
      price: 320,
      currency: 'ETB',
      vendorId: 1,
      categoryName: 'Food & Beverages',
      tags: ['teff', 'gluten-free', 'ethiopian', 'flour'],
      stock_quantity: 100,
      manage_stock: true,
    },
    {
      name: 'Ugali Flour - White Maize',
      description:
        'High-quality white maize flour for making traditional ugali. Finely ground and fresh.',
      price: 180,
      currency: 'KES',
      vendorId: 1,
      categoryName: 'Food & Beverages',
      tags: ['maize', 'ugali', 'staple', 'kenyan'],
      stock_quantity: 200,
      manage_stock: true,
    },

    // Clothing & Textiles
    {
      name: 'Kente Cloth - Handwoven',
      description:
        'Authentic handwoven Kente cloth with traditional patterns. Perfect for special occasions and cultural events.',
      price: 2500,
      currency: 'ETB',
      vendorId: 1,
      categoryName: 'Clothing & Textiles',
      tags: ['kente', 'handwoven', 'traditional', 'cultural'],
      featured: true,
      stock_quantity: 10,
      manage_stock: true,
    },
    {
      name: 'Kikoy Beach Wrap - Blue Stripes',
      description:
        'Traditional Kenyan kikoy beach wrap made from 100% cotton. Lightweight and versatile.',
      price: 1500,
      currency: 'KES',
      vendorId: 1,
      categoryName: 'Clothing & Textiles',
      tags: ['kikoy', 'beach', 'cotton', 'kenyan'],
      stock_quantity: 25,
      manage_stock: true,
    },
    {
      name: 'Habesha Dress - Traditional White',
      description:
        'Beautiful traditional Ethiopian dress made with hand-spun cotton and intricate embroidery.',
      price: 3200,
      currency: 'ETB',
      vendorId: 1,
      categoryName: 'Clothing & Textiles',
      tags: ['habesha', 'traditional', 'embroidery', 'cotton'],
      stock_quantity: 15,
      manage_stock: true,
    },

    // Handicrafts & Art
    {
      name: 'Wooden Elephant Carving - Mahogany',
      description:
        'Hand-carved mahogany elephant sculpture by skilled Kenyan artisans. Perfect home decoration piece.',
      price: 4500,
      currency: 'KES',
      vendorId: 1,
      categoryName: 'Handicrafts & Art',
      tags: ['carving', 'mahogany', 'elephant', 'handmade'],
      featured: true,
      stock_quantity: 8,
      manage_stock: true,
    },
    {
      name: 'Ethiopian Cross - Silver Plated',
      description:
        'Traditional Ethiopian Orthodox cross made with silver plating. Intricate religious artwork.',
      price: 1800,
      currency: 'ETB',
      vendorId: 1,
      categoryName: 'Handicrafts & Art',
      tags: ['cross', 'silver', 'religious', 'traditional'],
      stock_quantity: 12,
      manage_stock: true,
    },
    {
      name: 'Maasai Beaded Jewelry Set',
      description:
        'Authentic Maasai beaded necklace and bracelet set. Handmade with traditional patterns and colors.',
      price: 2200,
      currency: 'KES',
      vendorId: 1,
      categoryName: 'Handicrafts & Art',
      tags: ['maasai', 'beaded', 'jewelry', 'traditional'],
      stock_quantity: 20,
      manage_stock: true,
    },

    // Spices & Seasonings
    {
      name: 'Berbere Spice Mix - Authentic',
      description:
        'Traditional Ethiopian berbere spice blend with 16 different spices. Essential for Ethiopian cuisine.',
      price: 280,
      currency: 'ETB',
      vendorId: 1,
      categoryName: 'Food & Beverages',
      tags: ['berbere', 'spice', 'ethiopian', 'authentic'],
      stock_quantity: 60,
      manage_stock: true,
    },
    {
      name: 'Pilipili Sauce - Hot Pepper',
      description:
        'Spicy East African hot pepper sauce made with traditional recipes. Perfect for meat and vegetables.',
      price: 450,
      currency: 'KES',
      vendorId: 1,
      categoryName: 'Food & Beverages',
      tags: ['pilipili', 'hot-sauce', 'spicy', 'traditional'],
      stock_quantity: 40,
      manage_stock: true,
    },

    // Health & Beauty
    {
      name: 'Shea Butter - Raw Unrefined',
      description:
        'Pure, unrefined shea butter from West Africa. Excellent for skin and hair care.',
      price: 680,
      currency: 'ETB',
      vendorId: 1,
      categoryName: 'Health & Beauty',
      tags: ['shea-butter', 'organic', 'skincare', 'natural'],
      stock_quantity: 30,
      manage_stock: true,
    },
    {
      name: 'Aloe Vera Gel - Fresh',
      description:
        'Fresh aloe vera gel extracted from organically grown plants. Great for skin healing and moisturizing.',
      price: 350,
      currency: 'KES',
      vendorId: 1,
      categoryName: 'Health & Beauty',
      tags: ['aloe-vera', 'organic', 'skincare', 'natural'],
      stock_quantity: 45,
      manage_stock: true,
    },

    // Agricultural Products
    {
      name: 'Arabica Coffee Seedlings',
      description:
        'High-quality arabica coffee seedlings ready for planting. Disease-resistant varieties from Ethiopia.',
      price: 25,
      currency: 'ETB',
      vendorId: 1,
      categoryName: 'Agriculture',
      tags: ['coffee', 'seedlings', 'arabica', 'farming'],
      stock_quantity: 500,
      manage_stock: true,
    },
    {
      name: 'Passion Fruit Seeds - Purple',
      description:
        'Purple passion fruit seeds with high germination rate. Perfect for tropical farming.',
      price: 200,
      currency: 'KES',
      vendorId: 1,
      categoryName: 'Agriculture',
      tags: ['passion-fruit', 'seeds', 'tropical', 'farming'],
      stock_quantity: 100,
      manage_stock: true,
    },
  ];

  logger.log('Starting to seed products...');

  let seededCount = 0;
  let errorCount = 0;

  for (const productData of sampleProducts) {
    try {
      const { categoryName, tags, ...productInfo } = productData;

      // Create the product without category for now (categories might not exist)
      const product = await productsService.create({
        ...productInfo,
        status: 'publish',
      });

      logger.log(`✅ Seeded: ${product.name} (ID: ${product.id})`);
      seededCount++;
    } catch (err) {
      logger.error(`❌ Failed to seed ${productData.name}:`, err.message);
      errorCount++;
    }
  }

  logger.log(`\n🎉 Seeding completed!`);
  logger.log(`✅ Successfully seeded: ${seededCount} products`);
  logger.log(`❌ Failed to seed: ${errorCount} products`);

  await app.close();
}

bootstrap().catch((err) => {
  new Logger('CreateProducts').error(err);
});
