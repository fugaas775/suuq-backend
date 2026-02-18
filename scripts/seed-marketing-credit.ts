import 'dotenv/config';
import dataSource from '../src/data-source';
import { Coupon, DiscountType } from '../src/promotions/entities/coupon.entity';
import { FlashSale } from '../src/promotions/entities/flash-sale.entity';
import { CreditLimit } from '../src/credit/entities/credit-limit.entity';
import { User } from '../src/users/entities/user.entity';

async function run() {
  console.log('Initializing data source...');
  await dataSource.initialize();

  const userRepo = dataSource.getRepository(User);
  const couponRepo = dataSource.getRepository(Coupon);
  const flashSaleRepo = dataSource.getRepository(FlashSale);
  const creditLimitRepo = dataSource.getRepository(CreditLimit);

  // 1. Seed Coupon
  console.log('Seeding Coupon...');
  const couponCode = 'WELCOME20';
  let coupon = await couponRepo.findOne({ where: { code: couponCode } });
  if (!coupon) {
    coupon = couponRepo.create({
      code: couponCode,
      discountType: DiscountType.PERCENTAGE,
      amount: 20, // 20%
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      usageLimit: 100,
      minOrderAmount: 100,
      isActive: true,
    });
    await couponRepo.save(coupon);
    console.log('Created coupon: WELCOME20');
  } else {
    console.log('Coupon WELCOME20 already exists');
  }

  // 2. Seed Flash Sale
  console.log('Seeding Flash Sale...');
  const existingSale = await flashSaleRepo.findOne({
    where: { isActive: true },
  });

  if (!existingSale) {
    const sale = flashSaleRepo.create({
      title: 'Super Weekend Sale',
      description: 'Get 15% off on selected items!',
      startTime: new Date(), // Now
      endTime: new Date(Date.now() + 48 * 60 * 60 * 1000), // +48 hours
      isActive: true,
      discountPercentage: 15,
    });
    const savedSale = await flashSaleRepo.save(sale);
    console.log('Created Active Flash Sale');

    // Attach random products
    const products = await dataSource.query(
      'SELECT id FROM product ORDER BY RANDOM() LIMIT 5',
    );
    if (products.length > 0) {
      for (const p of products) {
        await dataSource.query(
          'INSERT INTO flash_sale_products_product ("flashSaleId", "productId") VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [savedSale.id, p.id],
        );
      }
      console.log(`Attached ${products.length} products to flash sale`);
    }
  } else {
    console.log('Active Flash Sale already exists');
  }

  // 3. Seed Credit Limit for first user
  console.log('Seeding Credit Limit...');
  const user = await userRepo.findOne({ where: {}, order: { id: 'ASC' } });
  if (user) {
    let limit = await creditLimitRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!limit) {
      limit = creditLimitRepo.create({
        user: user,
        maxLimit: 50000, // 50k ETB
        currentUsage: 0,
        currency: 'ETB',
        isEligible: true,
        isActive: true,
      });
      await creditLimitRepo.save(limit);
      console.log(
        `Created Credit Limit for User ID ${user.id} (${user.email})`,
      );
    } else {
      console.log(`Credit Limit already exists for User ID ${user.id}`);
    }
  } else {
    console.log('No user found to assign credit limit');
  }

  await dataSource.destroy();
}

run().catch((err) => console.error(err));
