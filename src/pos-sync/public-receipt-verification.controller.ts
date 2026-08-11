import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import {
  renderVerificationFormPage,
  renderVerificationResultPage,
} from './public-receipt-verification.page';
import { PublicReceiptVerificationService } from './public-receipt-verification.service';

/**
 * Public receipt verification — what the QR code printed on every POS receipt
 * points at.
 *
 * Unauthenticated by design: the audience is a customer holding a printed
 * receipt, who scans it to confirm the sale exists on our books with the total
 * the paper claims. The token is the only credential, which is why it is 70
 * random bits and why the payload stays thin (see the service).
 *
 * Two shapes of the same answer. `/page` renders it as a self-contained HTML
 * page — that is the one on the paper, proxied by nginx to
 * https://suuq-s.com/v/<code>. The bare route returns JSON for anything
 * programmatic.
 *
 * An unknown token answers 200 with `{ found: false }` (or the "no record"
 * card) rather than 404: a customer scanning a receipt from before this
 * shipped, or one whose sale is still stuck in a device outbox, should get an
 * explanation — not a browser error page.
 */
@ApiTags('public')
@Controller('public/receipts')
// Tighter than the global default: these routes are reachable without a
// credential, and the tokens are the only thing standing between a scraper and
// a list of real sales.
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class PublicReceiptVerificationController {
  constructor(
    private readonly verificationService: PublicReceiptVerificationService,
  ) {}

  /**
   * The typed-code fallback, for a camera that will not focus on the QR. Also
   * where a scan of a damaged code lands.
   */
  @Public()
  @Get('page')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiExcludeEndpoint()
  async formPage(@Query('code') code?: string) {
    if (!code || !code.trim()) {
      return renderVerificationFormPage(null);
    }
    return renderVerificationResultPage(
      await this.verificationService.verify(code),
    );
  }

  @Public()
  @Get('page/:code')
  @Header('Content-Type', 'text/html; charset=utf-8')
  // A receipt can be voided or refunded after it was printed, so this answer
  // has a shelf life of exactly one request.
  @Header('Cache-Control', 'no-store')
  @ApiExcludeEndpoint()
  async resultPage(@Param('code') code: string) {
    return renderVerificationResultPage(
      await this.verificationService.verify(code),
    );
  }

  @Public()
  @Get(':code')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Verify a printed POS receipt by its QR token' })
  verify(@Param('code') code: string) {
    return this.verificationService.verify(code);
  }
}
