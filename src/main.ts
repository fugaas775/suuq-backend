import 'dotenv/config';
import 'reflect-metadata';
const express = require('express');
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger, ClassSerializerInterceptor, BadRequestException } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { Reflector } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json } from 'express';
import { EtagInterceptor } from './common/interceptors/etag.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.use(json({ limit: '50mb' }));
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

  app.use(json({ limit: '50mb' }));

  // Log incoming requests and bodies for debugging
  app.use((req, res, next) => {
    console.log('--- Logging middleware triggered ---');
    console.log(`[${req.method}] ${req.url}`);
    console.log('Request headers:', req.headers);

    // Do not attempt to log body for multipart/form-data
    const contentType = req.headers['content-type'];
    if (contentType && contentType.includes('multipart/form-data')) {
      console.log('Incoming request body: <multipart/form-data stream>');
    } else if (typeof req.body !== 'undefined') {
      // Ensure body is not empty before trying to stringify
      const bodyString = JSON.stringify(req.body);
      console.log('Incoming request body:', bodyString === '{}' ? '<empty object>' : bodyString);
    } else {
      console.log('Incoming request body: <undefined>');
    }
    
    next();
  });
  
  // Set global prefix for all routes
  app.setGlobalPrefix('api');

  // Add logger for validation errors
  const logger = new Logger('ValidationPipe');

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) => {
      const messages = errors.map(error =>
        `${error.property}: ${Object.values(error.constraints).join(', ')}`
      );
      logger.warn(`Validation failed: ${messages}`);
      return new BadRequestException(messages);
    },
  }));

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalInterceptors(new EtagInterceptor(300));
  // Register global exception filter for detailed error logging
  app.useGlobalFilters(new GlobalExceptionFilter());
  
  await app.listen(3000, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
