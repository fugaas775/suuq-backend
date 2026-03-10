import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CreateBillDto,
  CreateServiceDto,
  GenerateDynamicQrDto,
  InitiateBankPaymentDto,
  InitiateWalletPaymentDto,
  StarpayHistoryQueryDto,
  StarpayReportQueryDto,
  VerifyPaymentDto,
} from './starpay.dto';
import { StarpayService } from './starpay.service';

@ApiTags('StarPay Payments')
@Controller('payments/starpay')
export class StarpayController {
  constructor(private readonly starpayService: StarpayService) {}

  @Post('verify')
  verifyPayment(@Body() body: VerifyPaymentDto) {
    return this.starpayService.verifyPayment(body);
  }

  @Post('bank')
  initiateBankPayment(@Body() body: InitiateBankPaymentDto) {
    return this.starpayService.initiateBankPayment(body);
  }

  @Post('wallet')
  initiateWalletPayment(@Body() body: InitiateWalletPaymentDto) {
    return this.starpayService.initiateWalletPayment(body);
  }

  @Post('qr')
  generateDynamicQr(@Body() body: GenerateDynamicQrDto) {
    return this.starpayService.generateDynamicQR(body);
  }

  @Post('services')
  createService(@Body() body: CreateServiceDto) {
    return this.starpayService.createService(body);
  }

  @Post('bills')
  createBill(@Body() body: CreateBillDto) {
    return this.starpayService.createBill(body);
  }

  @Get('eod-report')
  getEodReport(@Query() query: StarpayReportQueryDto) {
    return this.starpayService.getEodReport(query);
  }

  @Get('balance-history')
  getBalanceHistory(@Query() query: StarpayHistoryQueryDto) {
    return this.starpayService.getBalanceHistory(query);
  }

  @Get('settlements')
  getSettlementTransactions(@Query() query: StarpayHistoryQueryDto) {
    return this.starpayService.getSettlementTransactions(query);
  }
}
