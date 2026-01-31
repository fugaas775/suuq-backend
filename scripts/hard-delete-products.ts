import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Product } from '../src/products/entities/product.entity';
import { ProductImage } from '../src/products/entities/product-image.entity';
import { ProductImpression } from '../src/products/entities/product-impression.entity';
import { Review } from '../src/reviews/entities/review.entity';
import { OrderItem } from '../src/orders/entities/order.entity';
import { MediaCleanupTask } from '../src/media/entities/media-cleanup-task.entity';
import { DoSpacesService } from '../src/media/do-spaces.service';
import { FavoritesService } from '../src/favorites/favorites.service';
import { ProductRequestOffer } from '../src/product-requests/entities/product-request-offer.entity';
import { Conversation } from '../src/chat/entities/conversation.entity';

async function bootstrap() {
  const rawIds = process.argv
    .slice(2)
    .flatMap((arg) => arg.split(','))
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!rawIds.length) {
    console.error(
      'Usage: ts-node scripts/hard-delete-products.ts <id1,id2,...>',
    );
    process.exit(1);
  }

  const ids = Array.from(new Set(rawIds));
  console.log(`Hard deleting products: ${ids.join(', ')}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const productRepo = app.get(getRepositoryToken(Product));
  const imageRepo = app.get(getRepositoryToken(ProductImage));
  const reviewRepo = app.get(getRepositoryToken(Review));
  const impressionRepo = app.get(getRepositoryToken(ProductImpression));
  const orderItemRepo = app.get(getRepositoryToken(OrderItem));
  const cleanupRepo = app.get(getRepositoryToken(MediaCleanupTask));
  const doSpaces = app.get(DoSpacesService);
  const favorites = app.get(FavoritesService);
  const offerRepo = app.get(getRepositoryToken(ProductRequestOffer));
  const convoRepo = app.get(getRepositoryToken(Conversation));

  const results: Array<{ id: number; status: string; note?: string }> = [];

  for (const id of ids) {
    try {
      const product = await productRepo.findOne({
        where: { id },
        relations: ['images'],
      });
      if (!product) {
        results.push({ id, status: 'not-found' });
        continue;
      }

      // Collect media keys/urls for cleanup tasks (mirrors ProductsService.deleteProduct)
      const keys = new Set<string>();
      const urls = new Set<string>();
      if ((product as any).imageUrl)
        urls.add(String((product as any).imageUrl));
      for (const img of product.images || []) {
        if (img?.src) urls.add(String(img.src));
        if (img?.thumbnailSrc) urls.add(String(img.thumbnailSrc));
        if (img?.lowResSrc) urls.add(String(img.lowResSrc));
      }
      const attrs =
        (product as any).attributes &&
        typeof (product as any).attributes === 'object'
          ? { ...(product as any).attributes }
          : {};
      const dig = attrs.digital;
      if (
        dig &&
        typeof dig === 'object' &&
        dig.download &&
        typeof dig.download === 'object'
      ) {
        const k = dig.download.key;
        if (typeof k === 'string' && k) keys.add(k);
        const pub = dig.download.publicUrl;
        if (typeof pub === 'string' && pub) urls.add(pub);
      }
      const legacyKey = attrs.downloadKey || attrs.download_key;
      if (typeof legacyKey === 'string' && legacyKey) keys.add(legacyKey);
      const videoUrl = attrs.videoUrl || attrs.video_url;
      if (typeof videoUrl === 'string' && videoUrl) urls.add(videoUrl);
      const posterUrl = attrs.posterUrl || attrs.posterSrc || attrs.poster_url;
      if (typeof posterUrl === 'string' && posterUrl) urls.add(posterUrl);
      for (const u of Array.from(urls)) {
        try {
          const key = doSpaces.urlToKeyIfInBucket(u);
          if (key) keys.add(key);
        } catch {
          /* ignore */
        }
      }
      if (keys.size > 0) {
        const tasks = Array.from(keys).map((key) =>
          cleanupRepo.create({
            key,
            reasonType: 'product_delete',
            reasonId: String(id),
          }),
        );
        try {
          await cleanupRepo.save(tasks);
        } catch {
          /* ignore cleanup save errors */
        }
      }

      // Remove dependent rows to avoid FK issues and keep data tidy
      try {
        await reviewRepo.delete({ product: { id } } as any);
      } catch {}
      try {
        await impressionRepo.delete({ productId: id });
      } catch {}
      try {
        await favorites.removeProductEverywhere(id);
      } catch {}
      try {
        await orderItemRepo.delete({ product: { id } } as any);
      } catch {}
      // Null out foreign keys that block deletes
      try {
        await offerRepo
          .createQueryBuilder()
          .update(ProductRequestOffer)
          .set({ product: null as any, productId: null as any })
          .where('product_id = :id', { id })
          .execute();
      } catch {}
      try {
        await convoRepo
          .createQueryBuilder()
          .update(Conversation)
          .set({ product: null as any })
          .where('"productId" = :id', { id })
          .execute();
      } catch {}

      // Delete images explicitly in case cascade is missing in some envs
      try {
        await imageRepo.delete({ product: { id } } as any);
      } catch {}

      await productRepo.delete(id);
      results.push({ id, status: 'deleted' });
    } catch (err: any) {
      results.push({ id, status: 'error', note: String(err?.message || err) });
    }
  }

  await app.close();
  console.log('\nSummary:');
  for (const r of results) {
    console.log(`- ${r.id}: ${r.status}${r.note ? ' (' + r.note + ')' : ''}`);
  }
  process.exit(0);
}

bootstrap().catch((err) => {
  console.error('Fatal error in hard-delete script:', err);
  process.exit(1);
});
