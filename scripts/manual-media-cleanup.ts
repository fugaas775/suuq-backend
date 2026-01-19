import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MediaMaintenanceService } from '../src/media/media-maintenance.service';

async function bootstrap() {
  // Create generic application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule);
  
  // Get the service from the container
  const service = app.get(MediaMaintenanceService);

  try {
    console.log('--- Starting Manual Cleanup: Orphaned Verifications ---');
    await service.cleanupOrphanedVerifications();
    console.log('--- Finished Cleanup: Orphaned Verifications ---');

    console.log('\n--- Starting Manual Cleanup: Deleted Product Files ---');
    await service.cleanupDeletedProducts();
    console.log('--- Finished Cleanup: Deleted Product Files ---');
  } catch (error) {
    console.error('Error during manual cleanup:', error);
  } finally {
    await app.close();
    process.exit(0);
  }
}

bootstrap();
