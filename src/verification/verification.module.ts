import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { UsersModule } from '../users/users.module';
import { MediaModule } from '../media/media.module';
import { ETradeVerificationService } from './etrade-verification.service';
import { VerificationService } from './verification.service';
import { PhoneVerificationService } from './phone-verification.service';
import { PhoneVerificationController } from './phone-verification.controller';
import { RedisModule } from '../redis/redis.module';
import { EmailVerificationController } from './email-verification.controller';
import { EmailVerificationService } from './email-verification.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [UsersModule, MediaModule, RedisModule, EmailModule],
  controllers: (process.env.EMAIL_VERIFICATION_ENABLED === 'true')
    ? [VerificationController, PhoneVerificationController, EmailVerificationController]
    : [VerificationController, PhoneVerificationController],
  providers: (process.env.EMAIL_VERIFICATION_ENABLED === 'true')
    ? [ETradeVerificationService, VerificationService, PhoneVerificationService, EmailVerificationService]
    : [ETradeVerificationService, VerificationService, PhoneVerificationService],
})
export class VerificationModule {}
