import { Module } from '@nestjs/common';
import { LinkingController } from './linking.controller';

@Module({
  controllers: [LinkingController],
})
export class LinkingModule {}
