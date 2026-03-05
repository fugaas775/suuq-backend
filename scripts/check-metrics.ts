import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FeedInteractionService } from '../src/metrics/feed-interaction.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(FeedInteractionService);
  const summary = await service.getSummary(24);
  console.log(JSON.stringify(summary, null, 2));
  await app.close();
}
bootstrap();
