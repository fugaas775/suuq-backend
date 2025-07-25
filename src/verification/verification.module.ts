import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [VerificationController],
  providers: [],
})
export class VerificationModule {}
