import { Module } from '@nestjs/common';
import { EbirrService } from './ebirr.service';
import { EbirrController } from './ebirr.controller';

@Module({
  controllers: [EbirrController],
  providers: [EbirrService],
  exports: [EbirrService],
})
export class EbirrModule {}
