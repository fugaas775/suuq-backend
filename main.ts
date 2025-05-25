import 'reflect-metadata'; // required for TypeORM decorators
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api'); // all routes go under /api
  await app.listen(3000, '127.0.0.1'); // match Nginx config

console.log('JWT_SECRET:', process.env.JWT_SECRET);
}
bootstrap();

