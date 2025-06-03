import { Controller, Get } from '@nestjs/common';
import { ContentService } from './content.service';

@Controller('content/banners')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get('home')
  getHomeBanners() {
    return this.contentService.getHomeBanners();
  }
}
