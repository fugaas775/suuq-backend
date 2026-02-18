import {
  Controller,
  Get,
  Header,
  Query,
  Redirect,
  BadRequestException,
} from '@nestjs/common';
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

  @Get('open-app')
  @Redirect()
  openApp(@Query('target') target: string) {
    if (!target) {
      throw new BadRequestException('Target URL is required');
    }

    // Security: Only allow suuq:// scheme to prevent open redirect phishing
    if (!target.startsWith('suuq://')) {
      throw new BadRequestException(
        'Invalid target scheme. Only suuq:// allowed.',
      );
    }

    // Redirect to the custom scheme
    return { url: target, statusCode: 302 };
  }
}
