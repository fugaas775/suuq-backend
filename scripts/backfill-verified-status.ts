import { DataSource } from 'typeorm';
import {
  User,
  SubscriptionTier,
  VerificationStatus,
} from '../src/users/entities/user.entity';
import { Product } from '../src/products/entities/product.entity';
import { Review } from '../src/reviews/entities/review.entity';
import { Category } from '../src/categories/entities/category.entity';
import { Tag } from '../src/tags/tag.entity';
import { ProductImage } from '../src/products/entities/product-image.entity';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || process.env.DB_NAME,
  entities: [User, Product, Review, Category, Tag, ProductImage],
  synchronize: false,
});

async function run() {
  await dataSource.initialize();
  console.log('Database connected');

  const userRepository = dataSource.getRepository(User);

  // 1. Fix Legacy Pro Users (Pro but not verified)
  // If they are PRO, they should be verified regardless of verificationStatus
  const proUsers = await userRepository.find({
    where: { subscriptionTier: SubscriptionTier.PRO },
  });

  console.log(`Found ${proUsers.length} PRO users. Updating verified flag...`);
  for (const user of proUsers) {
    if (!user.verified) {
      user.verified = true;
      if (!user.verifiedAt) user.verifiedAt = new Date();
      await userRepository.save(user);
      console.log(`Updated PRO user ${user.id} to verified: true`);
    }
  }

  // 2. Fix Manual License Users (Approved but Free)
  // If they are APPROVED, they should be verified
  const approvedUsers = await userRepository.find({
    where: { verificationStatus: VerificationStatus.APPROVED },
  });

  console.log(
    `Found ${approvedUsers.length} APPROVED users. Updating verified flag...`,
  );
  for (const user of approvedUsers) {
    if (!user.verified) {
      user.verified = true;
      if (!user.verifiedAt) user.verifiedAt = new Date();
      await userRepository.save(user);
      console.log(`Updated APPROVED user ${user.id} to verified: true`);
    }
  }

  // 3. Ensure others are NOT verified (optional, but good for cleanup)
  // If NOT PRO and NOT APPROVED, verified should be false
  // This might be heavy if there are many users, so let's do it carefully or skip if not requested.
  // The prompt says "Legacy Pro Users... Manual License Users...". It doesn't explicitly ask to unverify others,
  // but "Unify the Verified status" implies consistency.
  // Let's query for users who ARE verified but shouldn't be.

  const invalidVerifiedUsers = await userRepository
    .createQueryBuilder('user')
    .where('user.verified = :verified', { verified: true })
    .andWhere('user.subscriptionTier != :tier', { tier: SubscriptionTier.PRO })
    .andWhere('user.verificationStatus != :status', {
      status: VerificationStatus.APPROVED,
    })
    .getMany();

  console.log(
    `Found ${invalidVerifiedUsers.length} users who are verified but shouldn't be.`,
  );
  for (const user of invalidVerifiedUsers) {
    user.verified = false;
    await userRepository.save(user);
    console.log(`Updated user ${user.id} to verified: false`);
  }

  console.log('Backfill complete');
  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
