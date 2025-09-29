import { Controller, Get } from '@nestjs/common';
import { HomeService } from './home.service';

@Controller()
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  // Aggregated home feed is exposed via ProductsController at GET /products/home

  // Server-driven UI config for Home
  @Get('home/config')
  async homeConfig() {
    // Note: clients should use /api/v2/home/feed for content; this remains for config-only needs
    return this.homeService.getHomeConfig();
  }
}
