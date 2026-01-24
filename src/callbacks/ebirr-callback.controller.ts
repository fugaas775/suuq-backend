
import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';

@ApiTags('Callbacks')
@Controller('api/callbacks/ebirr')
export class EbirrCallbackController {
  private readonly logger = new Logger(EbirrCallbackController.name);

  constructor(private readonly ordersService: OrdersService) {}

  @Get('finish')
  @ApiOperation({ summary: 'Ebirr Payment Return URL' })
  async handleEbirrReturn(
    @Query() query: any,
    @Res() res: Response,
  ) {
    this.logger.log(`Received Ebirr Return Callback: ${JSON.stringify(query)}`);

    try {
      const order = await this.ordersService.verifyAndCompleteEbirrOrder(query);
      
      const successUrl = process.env.SITE_URL 
         ? `${process.env.SITE_URL}/payment/ebirr/finish` 
         : 'https://suuq.ugasfuad.com/payment/ebirr/finish';
         
      if (order && order.paymentStatus === 'PAID') {
         // Redirect to app success page
         // We can append status=success to be sure
         return res.redirect(`${successUrl}?status=success&orderId=${order.id}`);
      } else {
         // Could not verify, or failed
         // Depending on Ebirr, maybe it's just a cancel?
         return res.redirect(`${successUrl}?status=failed`);
      }

    } catch (e: any) {
      this.logger.error(`Ebirr callback processing failed: ${e.message}`);
      // Redirect to failure page
      const siteUrl = process.env.SITE_URL || 'https://suuq.ugasfuad.com';
      return res.redirect(`${siteUrl}/payment/ebirr/finish?status=error`);
    }
  }
}
