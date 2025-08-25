import { Controller, Get, Query } from '@nestjs/common';
import { HomeService } from './home.service';

@Controller()
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  // Aggregated home feed is exposed via ProductsController at GET /products/home

  // Server-driven UI config for Home
  @Get('home/config')
  async homeConfig() {
    return this.homeService.getHomeConfig();
  }
}
