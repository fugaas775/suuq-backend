import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { UsersModule } from '../users/users.module';
import { MediaModule } from '../media/media.module'; // Import MediaModule

@Module({
  imports: [UsersModule, MediaModule], // Add MediaModule to imports
  controllers: [VerificationController],
  providers: [], // DoSpacesService is now available from MediaModule
})
export class VerificationModule {}
