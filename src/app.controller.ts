import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Header('Cache-Control', 'public, max-age=10, stale-while-revalidate=30')
  async getHealth(): Promise<object> {
    return this.appService.getHealth();
  }

  @Get('status')
  getStatus(): object {
    return this.appService.getStatus();
  }
}
