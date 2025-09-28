import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { DirectUploadController } from './direct-upload.controller';
import { MulterModule } from '@nestjs/platform-express';
import { DoSpacesService } from './do-spaces.service';
import { diskStorage } from 'multer';
import { ScheduleModule } from '@nestjs/schedule';
import { MediaMaintenanceService } from './media-maintenance.service';
// import { ContentModerationService } from '../moderation/content-moderation.service';

@Module({
  imports: [
  // 2. Replace the complex MulterModule config with this simple one
  ScheduleModule.forRoot(),
    MulterModule.register({
      storage: diskStorage({
        destination: '/tmp/uploads',
        filename: (req, file, cb) => {
          const ts = Date.now();
          // Keep original name tail but prefix with timestamp
          cb(null, `${ts}-${file.originalname}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  ],
  controllers: [MediaController, DirectUploadController],
  providers: [DoSpacesService, MediaMaintenanceService],
  exports: [DoSpacesService],
})
export class MediaModule {}
