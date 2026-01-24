import { Body, Controller, Get, Post } from '@nestjs/common';
import { EbirrService } from './ebirr.service';

@Controller('ebirr')
export class EbirrController {
  constructor(private readonly ebirrService: EbirrService) {}

  @Get('status')
  async checkStatus() {
    return this.ebirrService.checkConnectivity();
  }

  @Post('pay')
  async initiatePayment(@Body() body: {
    phoneNumber: string;
    amount: string;
    referenceId: string;
    invoiceId: string;
    description?: string;
  }) {
    return this.ebirrService.initiatePayment(body);
  }
}
