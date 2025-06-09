import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.enableCors();
  app.enableShutdownHooks(); // ✅ Graceful shutdown support

  // ✅ Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ✅ Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Suuq API')
    .setDescription('Suuq API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // ✅ Route logger (for dev)
  if (process.env.NODE_ENV !== 'production') {
    try {
      const server = app.getHttpServer();
      const router = server._events?.request?._router;
      if (router?.stack) {
        logger.log('📡 Available Routes:');
        router.stack
          .filter((r: any) => r.route)
          .forEach((r: any) => {
            const method = Object.keys(r.route.methods)[0].toUpperCase();
            const path = r.route.path;
            logger.log(`${method} /api${path}`);
          });
      } else {
        logger.warn('⚠️ Router not ready yet.');
      }
    } catch (error) {
      logger.error('🔥 Route logger failed:', error instanceof Error ? error.message : error);
    }
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`✅ Server listening on http://0.0.0.0:${port}`);
  logger.log(`📘 Swagger UI available at http://localhost:${port}/api/docs`);
}

bootstrap();
