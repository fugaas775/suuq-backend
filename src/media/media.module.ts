import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MulterModule } from '@nestjs/platform-express';
import { DoSpacesService } from './do-spaces.service';
import { memoryStorage } from 'multer'; // 1. Import memoryStorage

@Module({
  imports: [
    // 2. Replace the complex MulterModule config with this simple one
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 1024 * 1024 * 10, // 10 MB file size limit
      },
    }),
  ],
  controllers: [MediaController],
  providers: [DoSpacesService],
  exports: [DoSpacesService],
})
export class MediaModule {}
