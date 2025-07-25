import { Module } from '@nestjs/common';
import { TelebirrService } from './telebirr.service';

@Module({
  providers: [TelebirrService],
  exports: [TelebirrService],
})
export class TelebirrModule {}
