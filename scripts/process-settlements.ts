import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module'; // Adjust imports relative to scripts/ folder if needed
import { WalletService } from '../wallet/wallet.service';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const logger = new Logger('ProcessSettlementsScript');
  const walletService = app.get(WalletService);

  logger.log('Starting weekly settlement process...');
  try {
    const settlements = await walletService.processWeeklySettlements();
    logger.log(`Generated ${settlements.length} settlement records.`);
  } catch (e) {
    logger.error('Failed to process settlements', e);
  } finally {
    await app.close();
  }
}

bootstrap();
