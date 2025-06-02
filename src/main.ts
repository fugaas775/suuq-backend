import 'reflect-metadata'; // Needed for TypeORM
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api'); // All routes under /api
  app.enableCors();

  // Optional: Route Logger
  try {
    const server = app.getHttpServer();
    const router = server._events?.request?._router;

    if (router?.stack) {
      console.log('📡 Available Routes:');
      router.stack
        .filter((r: any) => r.route)
        .forEach((r: any) => {
          const method = Object.keys(r.route.methods)[0].toUpperCase();
          const path = r.route.path;
          console.log(`${method} /api${path}`);
        });
    } else {
      console.log('⚠️  Router not ready yet.');
    }
  } catch (error) {
    console.error(
      '🔥 Route logger failed:',
      error instanceof Error ? error.message : error,
    );
  }

  await app.listen(3000, '127.0.0.1');
}
bootstrap();
