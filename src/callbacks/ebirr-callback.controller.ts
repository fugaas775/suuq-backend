/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-enum-comparison */

import {
  Controller,
  Get,
  Query,
  Res,
  Logger,
  Post,
  Body,
} from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { EbirrService } from '../ebirr/ebirr.service';
import { BoostTier } from '../products/boost-pricing.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';

@ApiTags('Callbacks')
@Controller('callbacks/ebirr')
export class EbirrCallbackController {
  private readonly logger = new Logger(EbirrCallbackController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly productsService: ProductsService,
    private readonly ebirrService: EbirrService,
  ) {}

  @Post('webhook')
  @ApiOperation({ summary: 'Ebirr Payment Webhook' })
  async handleEbirrWebhook(@Body() body: any) {
    this.logger.log(`Received Ebirr Webhook: ${JSON.stringify(body)}`);
    await this.ebirrService.processCallback(body);
    return { status: 'OK' };
  }

  @Get('finish')
  @ApiOperation({ summary: 'Ebirr Payment Return URL' })
  async handleEbirrReturn(@Query() query: any, @Res() res: Response) {
    this.logger.log(`Received Ebirr Return Callback: ${JSON.stringify(query)}`);

    try {
      // Check if this is a Boost transaction first
      // Ebirr returns `res` with the encrypted response which OrdersService decrypts
      // We need to inspect the decrypted content.
      // Since `verifyAndCompleteEbirrOrder` decrypts and saves, we should let it run
      // OR refactor logic to be generic.

      // However, `verifyAndCompleteEbirrOrder` is tightly coupled to Orders.
      // Let's rely on the referenceId pattern if visible in query or if we can peek.
      // The query param usually has `res`.

      // Let's use ordersService as the "Parser" for now, but handle the result differently if it wasn't an order.
      // But ordersService throws if order not found.

      // Strategy: Let's assume OrdersService can be updated to return a "Transaction Object"
      // or we handle the flow here if we can decode the response.

      // Attempt to resolve referenceId (REF-{id} or BOOST-...) from common keys
      let refId =
        query.referenceId || query.refId || query.ReferenceId || query.ref;

      if (!refId) {
        // Fallback scan
        for (const val of Object.values(query)) {
          if (
            typeof val === 'string' &&
            (val.startsWith('REF-') || val.startsWith('BOOST-'))
          ) {
            refId = val;
            break;
          }
        }
      }

      // Handle Boost Flow
      if (refId && refId.startsWith('BOOST-')) {
        const parts = refId.split('-'); // BOOST-{pid}-{tier}-{ts}
        if (parts.length >= 3) {
          const productId = parseInt(parts[1]);
          const tier = parts[2] as BoostTier;
          try {
            const product = await this.productsService.findOne(productId);
            await this.productsService.promoteProduct(
              productId,
              tier,
              product.vendor,
            );
            this.logger.log(
              `Ebirr Callback: Boosted product ${productId} to ${tier}`,
            );

            const successUrl = process.env.SITE_URL
              ? `${process.env.SITE_URL}/payment/ebirr/finish`
              : 'https://suuq.ugasfuad.com/payment/ebirr/finish';
            return res.redirect(`${successUrl}?status=success&ref=${refId}`);
          } catch (e: any) {
            this.logger.error(`Ebirr Boost failed: ${e.message}`);
          }
        }
      }

      const order = await this.ordersService.verifyAndCompleteEbirrOrder(query);

      // If verifyAndCompleteEbirrOrder handles explicit BOOST logic (which we'll add),
      // then we just check the result type.

      const successUrl = process.env.SITE_URL
        ? `${process.env.SITE_URL}/payment/ebirr/finish`
        : 'https://suuq.ugasfuad.com/payment/ebirr/finish';

      if (
        order &&
        (order.paymentStatus === 'PAID' || (order as any).isBoostSuccess)
      ) {
        return res.redirect(
          `${successUrl}?status=success&ref=${(order as any).id || 'boost'}`,
        );
      } else {
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
