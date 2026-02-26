import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EmailProcessor } from './email.processor';

const emailProviders =
  process.env.NODE_ENV === 'test'
    ? [EmailService]
    : [EmailService, EmailProcessor];

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'emails',
    }),
  ],
  providers: emailProviders,
  exports: [EmailService],
})
export class EmailModule {}
