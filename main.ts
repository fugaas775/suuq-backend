import 'reflect-metadata'; // required for TypeORM decorators
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api'); // all routes go under /api

  // ✅ Enable global validation for DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,             // strip unknown fields
      forbidNonWhitelisted: true,  // throw if unknown fields are sent
      transform: true,             // auto-transform query/body types
    })
  );

  await app.listen(3000, '0.0.0.0');
  console.log('✅ Server listening on 0.0.0.0:3000');
  console.log('JWT_SECRET:', process.env.JWT_SECRET);
  console.log('Entities:', AppDataSource.entityMetadatas.map(e => e.name));

}
bootstrap();
