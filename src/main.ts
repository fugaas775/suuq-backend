import 'dotenv/config';
import 'reflect-metadata';
const express = require('express');
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger, ClassSerializerInterceptor, BadRequestException } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { Reflector } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { EtagInterceptor } from './common/interceptors/etag.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  // Disable Express automatic ETag; we'll manage ETag via interceptor selectively
  const expressApp = app.getHttpAdapter().getInstance();
  if (expressApp?.set) {
    expressApp.set('etag', false);
  }
    // Accept both JSON and application/x-www-form-urlencoded payloads
    app.use(urlencoded({ extended: true, limit: '50mb' }));
    app.use(json({ limit: '50mb' }));
  // Enable all log levels for better visibility in production
  app.useLogger(['log', 'error', 'warn', 'debug', 'verbose']);

  // CORS configuration (supports env list + robust preflight handling)
  const defaultAllowedOrigins = [
    'https://suuq.ugasfuad.com',
    'https://admin.suuq.ugasfuad.com',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:3001',
  ];
  const allowedOrigins = (process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : defaultAllowedOrigins).map((o) => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      // Allow no-origin requests (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
      'Origin',
      'origin',
      'X-Requested-With',
      'x-requested-with',
      'Content-Type',
      'content-type',
      'Accept',
      'accept',
      'Authorization',
      'authorization',
      'Cache-Control',
      'cache-control',
      'Pragma',
      'pragma',
      'If-None-Match',
      'if-none-match',
      'If-Modified-Since',
      'if-modified-since',
    ],
    exposedHeaders: [
      'Authorization',
      'ETag',
      'Last-Modified',
      'Cache-Control',
      // For admin UIs like React Admin that read totals from headers
      'Content-Range',
      'X-Total-Count',
    ],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // JSON already configured above

  // Ensure caching/CDNs vary responses per requesting origin
  app.use((req, res, next) => {
    res.setHeader('Vary', 'Origin');
    next();
  });

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
  // (removed temporary route introspection)
  
  await app.listen(3000, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
