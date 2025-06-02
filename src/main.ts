import 'reflect-metadata'; // Needed for TypeORM
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security middleware
  app.use(helmet({
    // TODO: Configure CSP and other helmet options for your specific needs
    contentSecurityPolicy: false, // Disable CSP for now, configure as needed
  }));

  // Rate limiting
  const rateLimiter = new RateLimiterMemory({
    points: 100, // Number of requests
    duration: 60, // Per 60 seconds (1 minute)
    // TODO: Adjust rate limiting rules for different endpoints as needed
  });

  app.use(async (req: any, res: any, next: any) => {
    try {
      await rateLimiter.consume(req.ip);
      next();
    } catch (rejRes: any) {
      res.status(429).send('Too Many Requests');
    }
  });

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

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '127.0.0.1';
  await app.listen(port, host);
  console.log(`🚀 Application is running on: http://${host}:${port}/api`);
}
bootstrap();
