import 'dotenv/config';
import 'reflect-metadata';
const express = require('express');
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import {
  ValidationPipe,
  Logger,
  ClassSerializerInterceptor,
  BadRequestException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { Reflector } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { EtagInterceptor } from './common/interceptors/etag.interceptor';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });

  // Apply security headers with helmet
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false, // Allow embedding for Swagger UI
    }),
  );

  // Add request ID middleware
  app.use((req: any, res: any, next: any) => {
    req.id = req.headers['x-request-id'] || uuidv4();
    res.setHeader('x-request-id', req.id);
    next();
  });

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
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : defaultAllowedOrigins
  ).map((o) => o.trim());

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
      'X-App-Version',
      'x-app-version',
      'X-Platform',
      'x-platform',
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
      'If-Match',
      'if-match',
      'If-Modified-Since',
      'if-modified-since',
    ],
    exposedHeaders: [
      'Authorization',
      'ETag',
      'Last-Modified',
      'Cache-Control',
      'Retry-After',
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

  // Improved logging with sanitization
  app.use((req: any, res: any, next: any) => {
    const requestId = req.id;
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      // Structured logging in production
      const logData = {
        requestId,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString(),
      };

      // Sanitize body in production - redact sensitive fields
      if (req.body && typeof req.body === 'object') {
        const sanitizedBody = { ...req.body };
        const sensitiveFields = [
          'password',
          'token',
          'secret',
          'authorization',
          'jwt',
        ];

        for (const field of sensitiveFields) {
          if (sanitizedBody[field]) {
            sanitizedBody[field] = '[REDACTED]';
          }
        }

        logData['body'] = sanitizedBody;
      }

      console.log(JSON.stringify(logData));
    } else {
      // Verbose logging in development
      console.log('--- Logging middleware triggered ---');
      console.log(`[${req.method}] ${req.url} (ID: ${requestId})`);
      console.log('Request headers:', req.headers);

      // Do not attempt to log body for multipart/form-data
      const contentType = req.headers['content-type'];
      if (contentType && contentType.includes('multipart/form-data')) {
        console.log('Incoming request body: <multipart/form-data stream>');
      } else if (typeof req.body !== 'undefined') {
        const bodyString = JSON.stringify(req.body);
        console.log(
          'Incoming request body:',
          bodyString === '{}' ? '<empty object>' : bodyString,
        );
      } else {
        console.log('Incoming request body: <undefined>');
      }
    }

    next();
  });

  // Set global prefix for all routes
  app.setGlobalPrefix('api');

  // Add logger for validation errors
  const logger = new Logger('ValidationPipe');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.map(
          (error) =>
            `${error.property}: ${Object.values(error.constraints).join(', ')}`,
        );
        logger.warn(`Validation failed: ${messages}`);
        return new BadRequestException(messages);
      },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalInterceptors(new EtagInterceptor(300));
  // Register global exception filter for detailed error logging
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Setup Swagger Documentation
  if (process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Suuq Backend API')
      .setDescription('The Suuq marketplace backend API documentation')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management')
      .addTag('products', 'Product management')
      .addTag('orders', 'Order management')
      .addTag('categories', 'Category management')
      .addTag('health', 'Health and readiness checks')
      .addTag('admin', 'Admin endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    Logger.log('Swagger documentation available at /api/docs', 'Bootstrap');
  }
  // (removed temporary route introspection)
  // Auto-run DB migrations unless disabled
  try {
    const ds = app.get(DataSource);
    const allowAuto =
      (process.env.AUTO_MIGRATE ?? 'true') !== 'false' &&
      process.env.NODE_ENV !== 'test';
    if (allowAuto && ds && typeof ds.runMigrations === 'function') {
      await ds.runMigrations();
      Logger.log('Database migrations executed on startup', 'Bootstrap');
    }
  } catch (e: any) {
    Logger.warn(
      `Auto migration skipped/failed: ${e?.message || e}`,
      'Bootstrap',
    );
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
