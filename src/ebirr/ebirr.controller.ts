import { Body, Controller, Get, Post, Param } from '@nestjs/common';
import { EbirrService } from './ebirr.service';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  IsNumberString,
} from 'class-validator';
import { SyncOrderStatusResponseDto } from './dto/sync-order-status-response.dto';

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

@ApiTags('Ebirr Payments')
@Controller('payments/ebirr')
export class EbirrController {
  constructor(private readonly ebirrService: EbirrService) {}

  @Get('status')
  async checkStatus() {
    return this.ebirrService.checkConnectivity();
  }

  @Post('pay')
  async initiatePayment(@Body() body: InitiatePaymentDto) {
    const response = await this.ebirrService.initiatePayment(body);
    return {
      ...response,
      toPayUrl: null,
      checkoutUrl: null,
      receiveCode: null,
      disableWebCheckoutFallback: true,
      skipOrderConfirmationScreen: true,
    };
  }

  @Get('sync-status/:orderId')
  @ApiOkResponse({ type: SyncOrderStatusResponseDto })
  async syncOrderStatus(@Param('orderId') orderId: string) {
    return this.ebirrService.checkOrderStatus(orderId);
  }

  @Post('check-status/:orderId')
  @ApiOkResponse({ type: SyncOrderStatusResponseDto })
  async checkOrderStatus(@Param('orderId') orderId: string) {
    return this.ebirrService.checkOrderStatus(orderId);
  }
}
