import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger, ClassSerializerInterceptor } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { Reflector } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable all log levels for better visibility in production
  app.useLogger(['log', 'error', 'warn', 'debug', 'verbose']);

  // --- THIS IS THE CRUCIAL FIX ---
  app.enableCors({
    origin: [
      'https://suuq.ugasfuad.com',
      'http://localhost:5173',
    ],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Authorization'],
  });

  // Log incoming requests for debugging
  app.use((req, res, next) => {
    // eslint-disable-next-line no-console
    console.log(`[${req.method}] ${req.url}`);
    next();
  });
  
  // Set global prefix for all routes
  app.setGlobalPrefix('api');

  // --- Keep your other global configurations ---
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  // Register global exception filter for detailed error logging
  app.useGlobalFilters(new GlobalExceptionFilter());
  
  await app.listen(3000, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
