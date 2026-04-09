import {
  Controller,
  Get,
  Query,
  Res,
  Logger,
  Post,
  Body,
  Headers,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { EbirrService } from '../ebirr/ebirr.service';
import { PosWorkspaceActivationService } from '../branch-staff/pos-workspace-activation.service';
import { BoostTier } from '../products/boost-pricing.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

@ApiTags('Callbacks')
@Controller('callbacks/ebirr')
export class EbirrCallbackController {
  private readonly logger = new Logger(EbirrCallbackController.name);

  private buildPosActivationRedirect(params: {
    status: 'success' | 'failed';
    referenceId?: string | null;
    reason?: string | null;
  }): string {
    const portalUrl = process.env.POS_PORTAL_URL || 'https://pos.ugasfuad.com';
    const query = new URLSearchParams();
    query.set('activationStatus', params.status);

    if (params.referenceId) {
      query.set('activationRef', params.referenceId);
    }

    if (params.reason) {
      query.set('activationReason', params.reason);
    }

    return `${portalUrl}/?${query.toString()}`;
  }

  private normalizeHeaderValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) {
      return String(value[0] || '').trim();
    }
    return String(value || '').trim();
  }

  private safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  }

  private normalizeHost(host: string): string {
    return String(host || '')
      .trim()
      .toLowerCase()
      .replace(/\.$/, '');
  }

  private extractHostFromUrl(raw: string): string | null {
    const value = String(raw || '').trim();
    if (!value) return null;
    try {
      const parsed = new URL(value);
      return this.normalizeHost(parsed.hostname);
    } catch {
      return null;
    }
  }

  private isHostAllowed(host: string, allowedHosts: string[]): boolean {
    const normalizedHost = this.normalizeHost(host);
    return allowedHosts.some((allowed) => {
      const normalizedAllowed = this.normalizeHost(allowed);
      return (
        normalizedHost === normalizedAllowed ||
        normalizedHost.endsWith(`.${normalizedAllowed}`)
      );
    });
  }

  private assertReturnOriginTrusted(
    headers: Record<string, string | string[] | undefined>,
    req: Request,
  ): void {
    const enforce =
      String(process.env.EBIRR_ENFORCE_RETURN_ORIGIN || 'false') === 'true';

    const allowedHosts = String(process.env.EBIRR_RETURN_ALLOWED_HOSTS || '')
      .split(',')
      .map((value) => this.normalizeHost(value))
      .filter(Boolean);

    const allowedIps = String(process.env.EBIRR_RETURN_ALLOWED_IPS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const originHost = this.extractHostFromUrl(
      this.normalizeHeaderValue(headers.origin),
    );
    const refererHost = this.extractHostFromUrl(
      this.normalizeHeaderValue(headers.referer),
    );

    const ipFromXForwardedFor = this.normalizeHeaderValue(
      headers['x-forwarded-for'],
    )
      .split(',')[0]
      ?.trim();
    const sourceIp =
      ipFromXForwardedFor ||
      this.normalizeHeaderValue(headers['x-real-ip']) ||
      req.ip ||
      '';

    const hostTrusted =
      allowedHosts.length > 0 &&
      [originHost, refererHost]
        .filter((host): host is string => Boolean(host))
        .some((host) => this.isHostAllowed(host, allowedHosts));

    const ipTrusted = allowedIps.length > 0 && allowedIps.includes(sourceIp);

    if (hostTrusted || ipTrusted) {
      return;
    }

    const diagnostic = JSON.stringify({
      originHost: originHost || null,
      refererHost: refererHost || null,
      sourceIp: sourceIp || null,
      enforce,
    });

    if (enforce) {
      throw new UnauthorizedException(
        `Unauthorized Ebirr return callback origin: ${diagnostic}`,
      );
    }

    this.logger.warn(
      `Ebirr return callback origin not trusted (enforcement disabled): ${diagnostic}`,
    );
  }

  private assertWebhookAuthorized(
    headers: Record<string, string | string[] | undefined>,
    body: any,
  ): void {
    const secret = String(process.env.EBIRR_WEBHOOK_SECRET || '').trim();
    if (!secret) {
      this.logger.warn(
        'EBIRR webhook received without EBIRR_WEBHOOK_SECRET configured. Auth validation is bypassed.',
      );
      return;
    }

    const providedSecret = this.normalizeHeaderValue(
      headers['x-ebirr-webhook-secret'],
    );
    if (providedSecret && this.safeEqual(providedSecret, secret)) {
      return;
    }

    const providedSignature = this.normalizeHeaderValue(
      headers['x-ebirr-signature'],
    );
    if (providedSignature) {
      const normalizedSignature = providedSignature.replace(/^sha256=/i, '');
      const computed = createHmac('sha256', secret)
        .update(JSON.stringify(body || {}))
        .digest('hex');
      if (this.safeEqual(normalizedSignature, computed)) {
        return;
      }
    }

    throw new UnauthorizedException('Unauthorized Ebirr webhook');
  }

  constructor(
    private readonly ordersService: OrdersService,
    private readonly productsService: ProductsService,
    private readonly ebirrService: EbirrService,
    private readonly posWorkspaceActivationService: PosWorkspaceActivationService,
  ) {}

  @Post('webhook')
  @ApiOperation({ summary: 'Ebirr Payment Webhook' })
  async handleEbirrWebhook(
    @Body() body: any,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    this.assertWebhookAuthorized(headers, body);
    this.logger.log(`Received Ebirr Webhook: ${JSON.stringify(body)}`);
    const result = await this.ebirrService.processCallback(body);

    if (
      result?.status === 'COMPLETED' &&
      this.posWorkspaceActivationService.isPosWorkspaceActivationReference(
        result.referenceId,
      )
    ) {
      await this.posWorkspaceActivationService.completeEbirrActivationPayment(
        result.referenceId,
      );
    }

    return { status: 'OK' };
  }

  @Get('finish')
  @ApiOperation({ summary: 'Ebirr Payment Return URL' })
  async handleEbirrReturn(
    @Query() query: any,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.assertReturnOriginTrusted(headers, req);
    this.logger.log(`Received Ebirr Return Callback: ${JSON.stringify(query)}`);

    try {
      const verifiedReturn =
        await this.ebirrService.verifyReturnCallback(query);
      if (!verifiedReturn.accepted) {
        this.logger.warn(
          `Ebirr return callback rejected before completion: ${JSON.stringify(verifiedReturn)}`,
        );
        if (
          this.posWorkspaceActivationService.isPosWorkspaceActivationReference(
            verifiedReturn.referenceId,
          )
        ) {
          return res.redirect(
            this.buildPosActivationRedirect({
              status: 'failed',
              referenceId: verifiedReturn.referenceId,
              reason: String(verifiedReturn.reason || 'invalid_return'),
            }),
          );
        }
        const siteUrl = process.env.SITE_URL || 'https://suuq.ugasfuad.com';
        return res.redirect(
          `${siteUrl}/payment/ebirr/finish?status=failed&reason=${encodeURIComponent(String(verifiedReturn.reason || 'invalid_return'))}`,
        );
      }

      if (
        this.posWorkspaceActivationService.isPosWorkspaceActivationReference(
          verifiedReturn.referenceId,
        )
      ) {
        await this.posWorkspaceActivationService.completeEbirrActivationPayment(
          verifiedReturn.referenceId,
        );
        return res.redirect(
          this.buildPosActivationRedirect({
            status: 'success',
            referenceId: verifiedReturn.referenceId,
          }),
        );
      }

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
      const failedRefId =
        query.referenceId ||
        query.refId ||
        query.ReferenceId ||
        query.ref ||
        null;
      if (
        this.posWorkspaceActivationService.isPosWorkspaceActivationReference(
          failedRefId,
        )
      ) {
        return res.redirect(
          this.buildPosActivationRedirect({
            status: 'failed',
            referenceId: failedRefId,
            reason: e?.message || 'callback_processing_failed',
          }),
        );
      }
      // Redirect to failure page
      const siteUrl = process.env.SITE_URL || 'https://suuq.ugasfuad.com';
      return res.redirect(`${siteUrl}/payment/ebirr/finish?status=error`);
    }
  }
}
