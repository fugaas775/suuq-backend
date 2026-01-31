/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Body, Controller, Get, Post, Param } from '@nestjs/common';
import { EbirrService } from './ebirr.service';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  IsNumberString,
} from 'class-validator';

class InitiatePaymentDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^(09|251|9)\d+$/, {
    message: 'Phone number must start with 09, 9, or 251',
  })
  phoneNumber!: string;

  @IsNotEmpty()
  @IsNumberString()
  amount!: string;

  @IsNotEmpty()
  @IsString()
  referenceId!: string;

  @IsNotEmpty()
  @IsString()
  invoiceId!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@Controller('payments/ebirr')
export class EbirrController {
  constructor(private readonly ebirrService: EbirrService) {}

  @Get('status')
  async checkStatus() {
    return this.ebirrService.checkConnectivity();
  }

  @Post('pay')
  async initiatePayment(@Body() body: InitiatePaymentDto) {
    return this.ebirrService.initiatePayment(body);
  }

  @Get('sync-status/:orderId')
  async syncOrderStatus(@Param('orderId') orderId: string) {
    return this.ebirrService.checkOrderStatus(orderId);
  }

  @Post('check-status/:orderId')
  async checkOrderStatus(@Param('orderId') orderId: string) {
    return this.ebirrService.checkOrderStatus(orderId);
  }
}
