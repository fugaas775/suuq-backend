import { Controller, Get } from '@nestjs/common';
import { EbirrService } from './ebirr.service';

@Controller('ebirr')
export class EbirrController {
  constructor(private readonly ebirrService: EbirrService) {}

  @Get('status')
  async checkStatus() {
    return this.ebirrService.checkConnectivity();
  }
}
